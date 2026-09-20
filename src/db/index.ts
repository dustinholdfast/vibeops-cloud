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
 * On Node the handle is cached for the process. On Workers it is cached on
 * the OpenNext request context (ALS `.run()`, not `enterWith` — workerd
 * does not implement `enterWith`).
 *
 * Do not cache postgres.js at isolate scope. Sockets are bound to the
 * request that created them; the next request on the same isolate that
 * reuses them hits "Cannot perform I/O on behalf of a different request"
 * or a promise that can never resolve. workerd then hang-cancels with
 * 1101. That is the leftover after #35/#37: sequential
 * `GET /api/health?deep=1` alternated 200 / 1101 because the first query
 * succeeded and poisoned the next. Hyperdrive is the real pool — a new
 * client per request is what their postgres.js docs recommend.
 *
 * Do not `client.end()` from a request handler. Ending races in-flight
 * siblings and caused 1101s when the uptime cron awaited closeDb().
 * Reset only this request's handle when a query actually loses the
 * socket ({@link withDb}).
 */

/** True inside workerd. Node and the build have no `navigator`. */
const onWorkers =
  typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';

type Client = ReturnType<typeof postgres>;
type Database = ReturnType<typeof drizzle>;
type RequestDb = { client: Client; database: Database };

/** Process-wide handle on Node (tests, scripts, `next start`). */
let client: Client | null = null;
let database: Database | null = null;

/**
 * Stashed on OpenNext's per-request Cloudflare context object.
 * workerd implements ALS `.run()` (that is how `getCloudflareContext` works);
 * it does not implement `enterWith`.
 */
const REQUEST_DB = Symbol('noxen-request-db');

type RequestContext = { [REQUEST_DB]?: RequestDb };

function workerRequestContext(): RequestContext | null {
  if (!onWorkers) return null;
  try {
    return getCloudflareContext() as RequestContext;
  } catch {
    return null;
  }
}

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

function openDatabase(): RequestDb {
  const raw = resolveConnectionString();
  if (!raw) {
    throw new Error('DATABASE_URL is not configured');
  }
  const connectionString = normaliseConnectionString(raw);

  const opened = postgres(connectionString, {
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
           * Per-request pool. Dashboard fan-out needs more than one concurrent
           * query; Hyperdrive still does the real origin pooling. Workers
           * allow at most ~6 concurrent external connections.
           */
          max: 5,
          /** Skips the pg_catalog round trip on connect. */
          fetch_types: false,
          idle_timeout: 5,
          /**
           * Must finish (and leave time for {@link withDb} to retry) inside
           * the dashboard client's 15s fetch abort, and inside the 6s
           * `?deep=1` budget. A connect with no timeout is one way a
           * request never returns a Response.
           */
          connect_timeout: 5,
        }
      : {}),
  });

  return { client: opened, database: drizzle(opened, { schema }) };
}

/**
 * How the current runtime stores the DB handle.
 *
 * `request` on Workers so sockets never cross I/O contexts.
 * `process` on Node so tests and scripts share one client.
 */
export function dbCacheKind(workers = onWorkers): 'request' | 'process' {
  return workers ? 'request' : 'process';
}

export function requireDb(): Database {
  const ctx = workerRequestContext();
  if (ctx) {
    const existing = ctx[REQUEST_DB];
    if (existing) return existing.database;
    const opened = openDatabase();
    ctx[REQUEST_DB] = opened;
    return opened.database;
  }

  if (database) {
    return database;
  }

  const opened = openDatabase();
  client = opened.client;
  database = opened.database;
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
  const ctx = workerRequestContext();
  if (ctx) ctx[REQUEST_DB] = undefined;
  const old = client;
  client = null;
  database = null;
  if (old) await old.end({ timeout: 5 });
}

/**
 * Drop the cached handle without closing the socket.
 *
 * On Workers this is the current request only. A connect error must not
 * tear down a sibling request's client. Do not `end()` here: that races
 * in-flight holders and caused Workers 1101s when the uptime cron awaited
 * closeDb().
 */
export function resetDb() {
  const ctx = workerRequestContext();
  if (ctx) {
    ctx[REQUEST_DB] = undefined;
    return;
  }
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

/** Postgres undefined_table — the migration has not been applied. */
export function isMissingRelationError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    String((error as { code: unknown }).code) === '42P01'
  );
}

/**
 * Whether a storage-ready probe should drop the isolate DB handle.
 *
 * Only a true connect/socket failure. A missing table is a migration
 * question. Any other query error must not tear down the Hyperdrive pool —
 * siblings in the same isolate (dashboard uptime card, Check now, projects)
 * are still using it.
 *
 * {@link withDb} already resets on connect errors and retries. Callers such
 * as `monitorStorageReady` must not call {@link resetDb} a second time, and
 * must not reset on every thrown error.
 */
export function shouldResetIsolateOnStorageError(error: unknown): boolean {
  if (isMissingRelationError(error)) return false;
  return isConnectError(error);
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
