import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
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
 * The handle is still cached per isolate, so connections are reused across
 * requests rather than reopened per query.
 */

/** True inside workerd. Node and the build have no `navigator`. */
const onWorkers =
  typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';

type Client = ReturnType<typeof postgres>;
type Database = ReturnType<typeof drizzle>;

let client: Client | null = null;
let database: Database | null = null;

export function requireDb(): Database {
  if (database) return database;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured');
  }

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
           * One connection per isolate. Workers runs many short-lived
           * isolates, and a ten-connection pool in each would exhaust Neon's
           * limit long before the traffic justified it. The pooled endpoint
           * does the real pooling.
           */
          max: 1,
          /** Skips the pg_catalog round trip on connect. */
          fetch_types: false,
          idle_timeout: 20,
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
 * Never call it from a request handler: the handle is shared by every request
 * in the isolate, and closing it would break the ones still in flight.
 */
export async function closeDb() {
  if (client) await client.end({ timeout: 5 });
  client = null;
  database = null;
}
