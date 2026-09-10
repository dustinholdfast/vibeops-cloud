#!/usr/bin/env node
/**
 * Applies the schema migrations, in order, without needing psql.
 *
 *   DATABASE_URL=postgres://… npm run db:apply                 # all of them
 *   DATABASE_URL=postgres://… npm run db:apply uptime-monitors.sql
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
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
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
      'PowerShell:  $env:DATABASE_URL="postgres://user:pass@host/db"; npm run db:apply',
      'bash:        DATABASE_URL="postgres://user:pass@host/db" npm run db:apply',
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
let parsed;
try {
  parsed = new URL(connectionString);
  target = `${parsed.hostname}${parsed.pathname}`;
} catch {
  console.error('DATABASE_URL is not a valid connection string.');
  process.exit(1);
}

/**
 * Catch a placeholder that was pasted rather than replaced.
 *
 * Documentation examples elide the interesting parts, and an elided example is
 * still a syntactically valid URL, so the first thing to complain is DNS —
 * `getaddrinfo ENOTFOUND %E2%80%A6-pooler%E2%80%A6`, which reads like a network
 * problem rather than "you did not fill this in".
 */
const placeholder =
  /[^\x20-\x7e]/.test(decodeURIComponent(parsed.hostname)) ||
  /%E2%80%A6|\.\.\.|<|>|YOUR_|EXAMPLE|PASSWORD/i.test(connectionString);

if (placeholder) {
  console.error(
    [
      'DATABASE_URL still contains placeholder text.',
      '',
      `  host: ${decodeURIComponent(parsed.hostname)}`,
      '',
      'Copy the real connection string from the Neon console:',
      '  Project → Branches → your branch → Connection string → Pooled connection',
      '',
      'It looks like:',
      '  postgres://USER:PASS@ep-something-123456-pooler.REGION.aws.neon.tech/neondb?sslmode=require',
    ].join('\n')
  );
  process.exit(1);
}

if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
  console.error(`DATABASE_URL must be a postgres:// URL, not ${parsed.protocol}//`);
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

/**
 * Creates the tables the SQL files then alter.
 *
 * Sequenced here rather than with `&&` in the npm script so that the URL is
 * validated before anything runs. drizzle-kit going first meant a placeholder
 * connection string produced a DNS error from a tool that had not been told
 * what was wrong with it.
 */
function push() {
  console.log('Pushing the Drizzle schema…');
  /**
   * Run drizzle-kit's script with this Node, rather than through npx.
   *
   * The wrapper on Windows is `npx.cmd`, and Node refuses to spawn a `.cmd`
   * without a shell; using one brings back unescaped argument concatenation and
   * a deprecation warning. The path is built rather than `require.resolve`d
   * because `bin.cjs` is not listed in the package's `exports`.
   */
  const bin = join(process.cwd(), 'node_modules', 'drizzle-kit', 'bin.cjs');
  if (!existsSync(bin)) {
    throw new Error('drizzle-kit is not installed. Run npm install first.');
  }

  const result = spawnSync(process.execPath, [bin, 'push', '--force'], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error('drizzle-kit push failed; the SQL migrations were not applied.');
  }
  console.log('');
}

async function main() {
  const [{ db, usr }] = await sql`select current_database() as db, current_user as usr`;
  console.log(`Target:   ${target}`);
  console.log(`Database: ${db} as ${usr}\n`);

  if (process.argv.includes('--push')) push();

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
