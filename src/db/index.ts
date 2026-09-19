import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { env } from '../lib/env';
import { getCloudflareContext } from '@opennextjs/cloudflare';

/**
 * The database handle, created on first use.
 *
 * Deliberately lazy. It used to be built at module scope, which works under
 * Node but not on Cloudflare Workers: bindings and secrets are not populated
 * while the global scope is still evaluating, so `process.env.DATABASE_URL`
 * read there is empty and every request afterwards believes the database is
 * unconfigured. Reading it on first call moves the lookup inside a request,
 * where the value exists.
 *
 * Cached for the isolate (Workers) or process (Node). Do not call
 * `client.end()` from a request — that races siblings and cancels them with
 * Workers 1101. Do not drop the cache from `after()` after every request
 * either: hard-refresh fan-out (projects + workspaces + billing) then hits a
 * new pool while the previous sockets are still draining, and GET
 * `/api/projects` hangs (Worker status 0) or throws a socket read that
 * `projectErrorResponse` used to hide as a generic 503. Reset only when a
 * query actually loses the socket ({@link withDb}).
 */

/** True inside workerd. Node and the build have no `navigator`. */
const onWorkers =
  typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';

type Client = ReturnType<typeof postgres>;
type Database = ReturnType<typeof drizzle>;

let client: Client | null = null;
let database: Database | null = null;

/**
 * Adjusts a connection string for what this driver and runtime actually
 * support. Returns it unchanged when there is nothing to fix.
 *
 * Both cases below come from strings copied verbatim out of Neon's console,
 * which is the normal way anyone configures this.
 */
export function normaliseConnectionString(raw: string, workers = onWorkers): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // Not our problem to diagnose; let the driver report it.
    return raw;
  }

  let changed = false;

  /**
   * `channel_binding` is a libpq option postgres.js does not implement. Rather
   * than ignore it, postgres.js forwards unknown parameters to the server in
   * the startup packet, and Postgres rejects the connection outright with
   * `unrecognized configuration parameter "channel_binding"`.
   *
   * Dropping it does not send anything in clear: the channel is still
   * TLS-protected by sslmode. What is lost is the binding of authentication to
   * that specific channel, which postgres.js cannot honour under any spelling.
   */
  if (url.searchParams.has('channel_binding')) {
    url.searchParams.delete('channel_binding');
    changed = true;
  }

  /**
   * On Workers, `sslmode=require` cannot connect at all.
   *
   * postgres.js implements it by passing `rejectUnauthorized: false`, and
   * workerd's node:tls shim answers `ERR_OPTION_NOT_IMPLEMENTED` — the TLS
   * handshake never starts. `verify-full` passes no such option and does
   * connect, and is the stricter setting of the two, so nothing is traded away
   * by preferring it here.
   */
  if (workers && url.searchParams.get('sslmode') === 'require') {
    url.searchParams.set('sslmode', 'verify-full');
    changed = true;
  }

  return changed ? url.toString() : raw;
}

/**
 * Prefer Cloudflare Hyperdrive when bound — Workers cannot reliably open a
 * direct TCP socket to Neon/Supabase (CONNECT_TIMEOUT), while Hyperdrive can.
 * Falls back to DATABASE_URL for Node/tests.
 */
export function hyperdriveConnectionString(): string | undefined {
  try {
    const hd = getCloudflareContext().env.HYPERDRIVE as
      | { connectionString?: string }
      | undefined;
    return hd?.connectionString;
  } catch {
    // Outside a request context (build/tests).
    return undefined;
  }
}

function resolveConnectionString(): string | undefined {
  if (onWorkers) {
    const fromHyperdrive = hyperdriveConnectionString();
    if (fromHyperdrive) return fromHyperdrive;
  }
  return env('DATABASE_URL');
}

export function requireDb(): Database {
  if (database) {
    return database;
  }

  const raw = resolveConnectionString();
  if (!raw) {
    throw new Error('DATABASE_URL is not configured');
  }
  const connectionString = normaliseConnectionString(raw);

  client = postgres(connectionString, {
    /**
     * Required by every transaction-mode pooler — Neon's pooled endpoint,
     * PgBouncer, Hyperdrive. Prepared statements belong to a session, and a
     * pooler can hand each transaction a different one.
     *
     * This was already set before the move to Workers, which is why
     * `pg_advisory_xact_lock` in `project-transaction.ts` survives pooling:
     * the lock is transaction-scoped, so it lives and dies inside the unit a
     * transaction-mode pooler actually pools.
     */
    prepare: false,

    ...(onWorkers
      ? {
          /**
           * Small pool per isolate. Dashboard fan-out needs more than one
           * concurrent query; Neon’s pooler still does the real pooling.
           */
          max: 5,
          /** Skips the pg_catalog round trip on connect. */
          fetch_types: false,
          idle_timeout: 20,
          /**
           * Must finish (and leave time for {@link withDb} to retry) inside the
           * dashboard client's 15s fetch abort. Hyperdrive + Supabase is always
           * on; the old 20s budget was for Neon scale-to-zero and let the first
           * attempt outlive the browser, so hard refresh saw a hung
           * `/api/projects` instead of a retry.
           */
          connect_timeout: 8,
        }
      : {}),
  });

  database = drizzle(client, { schema });
  return database;
}

/**
 * Closes the connection pool.
 *
 * For short-lived processes — scripts, the test harness — so they can exit.
 * Never await this from a Worker request handler: the handle is shared by
 * every request in the isolate. Prefer {@link resetDb} there.
 *
 * Always clears the cache *before* ending so a wedged `end()` cannot leave
 * callers holding a corpse for the rest of the isolate's life.
 */
export async function closeDb() {
  const old = client;
  client = null;
  database = null;
  if (old) await old.end({ timeout: 5 });
}

/**
 * Drop the cached handle without closing the socket.
 *
 * Isolates reuse the client across requests. If Neon suspends or a TCP path
 * dies, clearing the cache lets the following request open a fresh connection.
 * Do not `end()` here: that races in-flight holders and caused Workers 1101s
 * when the uptime cron awaited closeDb().
 */
export function resetDb() {
  client = null;
  database = null;
}

/**
 * A socket that never came up or died mid-read. Distinct from a query error so
 * a retry cannot turn a 409 into a duplicate write.
 *
 * postgres.js usually reports `write CONNECT_TIMEOUT host:port`. The live
 * Worker also throws a message-less Error whose stack is a `Socket` /
 * `startRead` frame — `projectErrorResponse` logged that as
 * `[projects] request failed` and the dashboard toasted the generic 503.
 */
export function isConnectError(error: unknown): boolean {
  const code =
    typeof error === 'object' && error && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack ?? '' : '';
  const haystack = `${code}\n${message}\n${stack}`;
  if (
    /CONNECT_TIMEOUT|CONNECTION_CLOSED|CONNECT_CLOSED|CONNECTION_ENDED|CONNECTION_DESTROYED|ECONNRESET|EPIPE|ECONNREFUSED|ETIMEDOUT|connection timed out|connection terminated|server closed the connection/i.test(
      haystack
    )
  ) {
    return true;
  }
  return (
    error instanceof Error &&
    !error.message &&
    /Socket|startRead|internal_net/i.test(stack)
  );
}

/**
 * Run a database operation, and if the socket never came up, drop the cached
 * handle and try once more.
 *
 * A suspended Neon compute is woken by the first TCP attempt. That attempt
 * often loses to `connect_timeout`; the retry then lands on a live compute.
 * Do not retry application errors — a 409 must stay a 409.
 */
export async function withDb<T>(operation: (db: Database) => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await operation(requireDb());
    } catch (error) {
      last = error;
      if (!isConnectError(error)) throw error;
      resetDb();
    }
  }
  throw last;
}
