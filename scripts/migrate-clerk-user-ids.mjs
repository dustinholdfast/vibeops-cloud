#!/usr/bin/env node
/**
 * Rewrites Clerk user IDs across every place the database stores one, for the
 * development-to-production Clerk cutover.
 *
 *   node scripts/migrate-clerk-user-ids.mjs mapping.json           # dry run
 *   node scripts/migrate-clerk-user-ids.mjs mapping.json --apply   # commit
 *
 * `mapping.json` maps old Clerk user id to new:
 *
 *   { "user_2oldAAA": "user_2newAAA", "user_2oldBBB": "user_2newBBB" }
 *
 * Dry run is the default and touches nothing. `--apply` runs every update in a
 * single transaction: it commits completely or not at all.
 *
 * ## Why this is not two UPDATE statements
 *
 * A Clerk user id is stored in twelve places, not the two an earlier version of
 * the cutover runbook named. Five of them are `workspace_id` columns, because a
 * personal workspace's id *is* its owner's Clerk user id.
 *
 * That distinction decides whether the cutover works. Access to a project is
 * granted by workspace membership, never by `projects.user_id`, which exists
 * only for attribution. Rewriting the user-id columns and leaving the
 * workspace ids alone would migrate the cosmetic field and orphan the access
 * path: every user would sign in successfully and see nothing.
 */
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

const [, , mappingPath, ...flags] = process.argv;
const apply = flags.includes('--apply');
const allowUnmapped = flags.includes('--allow-unmapped');

if (!mappingPath) {
  console.error(
    [
      'Usage: node scripts/migrate-clerk-user-ids.mjs <mapping.json> [--apply]',
      '',
      'mapping.json: { "<old clerk id>": "<new clerk id>", … }',
      '',
      'Runs as a dry run unless --apply is given.',
    ].join('\n')
  );
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

/**
 * Every column that holds a Clerk user id.
 *
 * `kind` matters: `user` columns hold the id directly, `workspace` columns hold
 * a personal workspace's id, which equals the owner's Clerk user id. Team
 * workspace ids are generated and must never be rewritten, so the workspace
 * columns are restricted to ids proven personal by the `workspaces` table.
 */
const TARGETS = [
  { table: 'projects', column: 'user_id', kind: 'user' },
  { table: 'subscriptions', column: 'user_id', kind: 'user', pk: true },
  { table: 'workspaces', column: 'owner_user_id', kind: 'user' },
  { table: 'workspace_members', column: 'user_id', kind: 'user', pk: true },
  { table: 'workspace_invites', column: 'invited_by_user_id', kind: 'user' },
  { table: 'workspace_invites', column: 'accepted_by_user_id', kind: 'user' },
  { table: 'email_preferences', column: 'user_id', kind: 'user', pk: true },

  { table: 'workspaces', column: 'id', kind: 'workspace', pk: true },
  { table: 'projects', column: 'workspace_id', kind: 'workspace' },
  { table: 'workspace_members', column: 'workspace_id', kind: 'workspace', pk: true },
  { table: 'workspace_invites', column: 'workspace_id', kind: 'workspace' },
  { table: 'project_monitors', column: 'workspace_id', kind: 'workspace' },
];

const sql = postgres(connectionString, { prepare: false, max: 1 });

function fail(message) {
  console.error(`\n✗ ${message}`);
  return sql.end().then(() => process.exit(1));
}

/** Tables that may legitimately be absent (their migration may not have run). */
async function tableExists(name) {
  const [row] = await sql`
    SELECT 1 AS present FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ${name}
  `;
  return Boolean(row);
}

async function main() {
  const raw = JSON.parse(readFileSync(mappingPath, 'utf8'));
  const pairs = Object.entries(raw).filter(([from, to]) => from !== to);

  if (pairs.length === 0) return fail('The mapping is empty (or maps every id to itself).');
  for (const [from, to] of pairs) {
    if (typeof from !== 'string' || typeof to !== 'string' || !from || !to) {
      return fail(`Every entry must be a non-empty string: saw ${from} -> ${to}`);
    }
  }

  const targets = new Set();
  for (const [, to] of pairs) {
    if (targets.has(to)) {
      return fail(
        `Two old ids map to "${to}". Primary keys would collide; each new id must be used once.`
      );
    }
    targets.add(to);
  }

  const from = pairs.map(([f]) => f);
  const to = pairs.map(([, t]) => t);

  console.log(`Mapping ${pairs.length} user id${pairs.length === 1 ? '' : 's'}.`);
  console.log(apply ? 'Mode: APPLY (will commit)\n' : 'Mode: dry run (nothing written)\n');

  // Skip tables whose migration has not been applied on this database.
  const present = [];
  for (const target of TARGETS) {
    if (await tableExists(target.table)) present.push(target);
    else console.log(`  – skipping ${target.table}.${target.column} (table absent)`);
  }

  // A personal workspace id equals its owner's Clerk user id; a team workspace
  // id is generated. Only the former may be rewritten, and the workspaces table
  // is the only authority on which is which.
  const personalRows = await sql`
    SELECT id FROM workspaces WHERE personal = 1 AND id = ANY(${from}::text[])
  `;
  const personal = new Set(personalRows.map((row) => row.id));
  const personalFrom = from.filter((id) => personal.has(id));
  const personalTo = personalFrom.map((id) => to[from.indexOf(id)]);

  console.log(
    `\n${personalFrom.length} of ${from.length} mapped ids own a personal workspace.`
  );

  // Pre-flight: is every Clerk id in the database actually covered?
  const unmapped = new Map();
  for (const target of present) {
    if (target.kind !== 'user') continue;
    const rows = await sql`
      SELECT DISTINCT ${sql(target.column)} AS id
      FROM ${sql(target.table)}
      WHERE ${sql(target.column)} IS NOT NULL
        AND NOT (${sql(target.column)} = ANY(${from}::text[]))
    `;
    for (const row of rows) {
      const where = unmapped.get(row.id) ?? [];
      where.push(`${target.table}.${target.column}`);
      unmapped.set(row.id, where);
    }
  }

  if (unmapped.size > 0) {
    console.log(`\n⚠ ${unmapped.size} Clerk id(s) in the database have no mapping:`);
    for (const [id, where] of [...unmapped].slice(0, 20)) {
      console.log(`    ${id}  (${where.join(', ')})`);
    }
    if (unmapped.size > 20) console.log(`    … and ${unmapped.size - 20} more`);
    if (!allowUnmapped) {
      return fail(
        'Refusing to continue: those rows would keep dead Clerk ids and their\n' +
          '  owners would lose access. Complete the mapping, or pass\n' +
          '  --allow-unmapped if leaving them behind is genuinely intended.'
      );
    }
    console.log('  Continuing because --allow-unmapped was given.');
  } else {
    console.log('\n✓ Every Clerk id in the database has a mapping.');
  }

  // Pre-flight: would any new id collide with a row that already exists?
  for (const target of present) {
    const candidates = target.kind === 'workspace' ? personalTo : to;
    if (candidates.length === 0) continue;
    const [row] = await sql`
      SELECT count(*)::int AS n
      FROM ${sql(target.table)}
      WHERE ${sql(target.column)} = ANY(${candidates}::text[])
    `;
    if (row.n > 0) {
      return fail(
        `${target.table}.${target.column} already contains ${row.n} row(s) using a\n` +
          '  new id. Migrating would collide or merge two accounts. Resolve those\n' +
          '  rows first.'
      );
    }
  }
  console.log('✓ No new id already exists in the database.');

  // What would change
  console.log('\nRows affected:');
  let total = 0;
  for (const target of present) {
    const candidates = target.kind === 'workspace' ? personalFrom : from;
    if (candidates.length === 0) continue;
    const [row] = await sql`
      SELECT count(*)::int AS n
      FROM ${sql(target.table)}
      WHERE ${sql(target.column)} = ANY(${candidates}::text[])
    `;
    total += row.n;
    const label = `${target.table}.${target.column}`.padEnd(42);
    console.log(`  ${label} ${String(row.n).padStart(6)}${target.pk ? '   (key)' : ''}`);
  }
  console.log(`  ${'total'.padEnd(42)} ${String(total).padStart(6)}`);

  if (!apply) {
    console.log('\nDry run complete. Nothing was written. Re-run with --apply to commit.');
    return sql.end();
  }

  // One transaction: all of it, or none of it.
  await sql.begin(async (tx) => {
    for (const target of present) {
      const oldIds = target.kind === 'workspace' ? personalFrom : from;
      const newIds = target.kind === 'workspace' ? personalTo : to;
      if (oldIds.length === 0) continue;

      const result = await tx`
        UPDATE ${tx(target.table)} AS t
        SET ${tx(target.column)} = m.new_id
        FROM (
          SELECT * FROM unnest(${oldIds}::text[], ${newIds}::text[]) AS u(old_id, new_id)
        ) AS m
        WHERE t.${tx(target.column)} = m.old_id
      `;
      console.log(`  updated ${target.table}.${target.column}: ${result.count}`);
    }

    // Verify inside the transaction, so a surprise rolls the whole thing back.
    for (const target of present) {
      const oldIds = target.kind === 'workspace' ? personalFrom : from;
      if (oldIds.length === 0) continue;
      const [row] = await tx`
        SELECT count(*)::int AS n
        FROM ${tx(target.table)}
        WHERE ${tx(target.column)} = ANY(${oldIds}::text[])
      `;
      if (row.n > 0) {
        throw new Error(
          `${target.table}.${target.column} still holds ${row.n} old id(s) after the ` +
            'update. Rolling back.'
        );
      }
    }
  });

  console.log('\n✓ Committed. Verify sign-in and project ownership before deleting the backup.');
  await sql.end();
}

main().catch(async (error) => {
  console.error(`\n✗ ${error.message}`);
  await sql.end().catch(() => {});
  process.exit(1);
});
