#!/usr/bin/env node
/**
 * Applies the schema migrations, in order, without needing psql.
 *
 *   DATABASE_URL=… node scripts/apply-migrations.mjs           # all of them
 *   DATABASE_URL=… node scripts/apply-migrations.mjs uptime-monitors.sql
 *
 * Every migration is written to be safe to rerun, so applying them all to a
 * database that already has some is the normal case, not a repair.
 *
 * ## Why not psql
 *
 * It is not installed here, and requiring it puts a Postgres client install
 * between someone and a database they can already reach from this project.
 * The `postgres` package is already a dependency.
 *
 * ## The reserved connection
 *
 * Each file wraps itself in `BEGIN; … COMMIT;`, which is right for `psql -f`
 * and which postgres.js refuses on a pooled connection: it cannot know which
 * socket the later statements would land on, so it raises UNSAFE_TRANSACTION.
 * Reserving one connection is one of the three paths it sanctions. The test
 * harness hit exactly this and does the same thing.
 */
import { readFileSync, existsSync } from 'node:fs';
import postgres from 'postgres';

/** Dependency order: later files assume the tables earlier ones create. */
const MIGRATIONS = [
  'reliable-saves.sql',
  'team-workspaces.sql',
  'email-preferences.sql',
  'uptime-monitors.sql',
];

const requested = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
const files = requested.length ? requested : MIGRATIONS;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error(
    [
      'DATABASE_URL is not set.',
      '',
      'PowerShell:  $env:DATABASE_URL="postgres://…"; node scripts/apply-migrations.mjs',
      'bash:        DATABASE_URL="postgres://…" node scripts/apply-migrations.mjs',
      '',
      'Note the $env: prefix in PowerShell — a bare $DATABASE_URL expands to nothing.',
    ].join('\n')
  );
  process.exit(1);
}

for (const name of files) {
  if (!existsSync(`scripts/${name}`)) {
    console.error(`No such migration: scripts/${name}`);
    console.error(`Known: ${MIGRATIONS.join(', ')}`);
    process.exit(1);
  }
}

// Say which database, out loud, before touching it. The connection string
// carries a password, so only the parts that identify the target are printed.
let target;
try {
  const url = new URL(connectionString);
  target = `${url.hostname}${url.pathname}`;
} catch {
  console.error('DATABASE_URL is not a valid connection string.');
  process.exit(1);
}

const sql = postgres(connectionString, {
  prepare: false,
  max: 1,
  /**
   * "relation already exists, skipping" is what a rerunnable migration is
   * supposed to say, and printing the full notice object for each one buries
   * the result. Real problems raise instead of notifying.
   */
  onnotice: () => {},
});

async function main() {
  const [{ db, usr }] = await sql`select current_database() as db, current_user as usr`;
  console.log(`Target:   ${target}`);
  console.log(`Database: ${db} as ${usr}`);
  console.log(`Applying: ${files.join(', ')}\n`);

  for (const name of files) {
    const reserved = await sql.reserve();
    try {
      await reserved.unsafe(readFileSync(`scripts/${name}`, 'utf8'));
      console.log(`  ok   ${name}`);
    } catch (error) {
      console.error(`  fail ${name}: ${error.message}`);
      throw error;
    } finally {
      reserved.release();
    }
  }

  const tables = await sql`
    select table_name from information_schema.tables
     where table_schema = 'public'
     order by table_name
  `;
  console.log(`\nTables now present: ${tables.map((t) => t.table_name).join(', ')}`);
  await sql.end();
}

main().catch(async (error) => {
  console.error(`\n✗ ${error.message}`);
  await sql.end().catch(() => {});
  process.exit(1);
});
