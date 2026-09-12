import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { AsyncLocalStorage } from 'node:async_hooks';
import { after } from 'next/server';
import * as schema from './schema';

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
 * On Node the handle is cached for the process. On Workers each request gets
 * its own postgres.js client (AsyncLocalStorage): sharing one socket across
 * concurrent dashboard fetches hung into opaque 1101s, and reusing a socket
 * across sequential requests went half-dead on Neon after the first query.
 */

/** True inside workerd. Node and the build have no `navigator`. */
const onWorkers =
  typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';

type Client = ReturnType<typeof postgres>;
type Database = ReturnType<typeof drizzle>;

type RequestDb = { client: Client; database: Database };

/** Per-request handle on Workers. */
const requestDb = new AsyncLocalStorage<RequestDb>();

/** Process-wide handle on Node (tests, scripts, `next start`). */
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

function openClient(): Client {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error('DATABASE_URL is not configured');
  }
  const connectionString = normaliseConnectionString(raw);

  return postgres(connectionString, {
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
          /** One socket for this request only — see module doc. */
          max: 1,
          /** Skips the pg_catalog round trip on connect. */
          fetch_types: false,
          idle_timeout: 5,
          /**
           * Without this, a suspended Neon branch (or a wedged TCP path) leaves
           * the request hanging until workerd cancels it with a opaque 1101.
           * Prefer a fast, named failure the cron can surface.
           */
          connect_timeout: 5,
        }
      : {}),
  });
}

export function requireDb(): Database {
  if (onWorkers) {
    const existing = requestDb.getStore();
    if (existing) return existing.database;

    const reqClient = openClient();
    const reqDatabase = drizzle(reqClient, { schema });
    const store: RequestDb = { client: reqClient, database: reqDatabase };
    // Persist for the rest of this request's async chain (multiple service calls).
    requestDb.enterWith(store);

    try {
      after(() => {
        // Drop locals; best-effort end so Neon slots are not held for idle_timeout.
        try {
          void Promise.resolve(reqClient.end({ timeout: 1 })).catch(() => {});
        } catch {
          /* already dead */
        }
      });
    } catch {
      // `after()` only works inside a request/lifecycle context (not every test).
    }

    return reqDatabase;
  }

  if (database) return database;

  client = openClient();
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
 * On Workers the live handle lives in AsyncLocalStorage, so this mainly
 * clears any leftover Node-style cache. Kept for monitor/digest failure paths
 * and the uptime cron finally block.
 */
export function resetDb() {
  client = null;
  database = null;
}
