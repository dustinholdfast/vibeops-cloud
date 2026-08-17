import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn(
    '[vibeops-cloud] DATABASE_URL is not set. API routes that touch the DB will fail until it is configured.'
  );
}

const client = connectionString
  ? postgres(connectionString, { prepare: false })
  : (null as unknown as ReturnType<typeof postgres>);

export const db = connectionString
  ? drizzle(client, { schema })
  : (null as unknown as ReturnType<typeof drizzle>);

export function requireDb() {
  if (!db || !connectionString) {
    throw new Error('DATABASE_URL is not configured');
  }
  return db;
}
