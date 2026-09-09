#!/usr/bin/env node
/**
 * Runs the project-service integration tests against a disposable PostgreSQL
 * database. Never point this at a database that holds real data: the suite
 * drops and recreates the `projects` and `subscriptions` tables.
 *
 *   TEST_DATABASE_URL=postgres://user@127.0.0.1:5432/vibeops_test npm run test:db
 *
 * A throwaway server, if you do not already have one:
 *
 *   docker run --rm -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:17
 *   TEST_DATABASE_URL=postgres://postgres:test@127.0.0.1:55432/postgres npm run test:db
 *
 * Or with a local install (initdb once, then start on a spare port):
 *
 *   initdb -D ./.pgtest -U postgres -A trust
 *   pg_ctl -D ./.pgtest -o "-p 55432" -l ./.pgtest/log start
 *   createdb -h 127.0.0.1 -p 55432 -U postgres vibeops_test
 *   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/vibeops_test npm run test:db
 *   pg_ctl -D ./.pgtest stop
 */
import { spawn } from 'node:child_process';

const url = process.env.TEST_DATABASE_URL;

if (!url) {
  console.error(
    [
      'TEST_DATABASE_URL is not set.',
      '',
      'These tests need a real, disposable PostgreSQL database — they drop and',
      'recreate the projects and subscriptions tables. See the header of',
      'scripts/test-db.mjs for two ways to get one.',
    ].join('\n')
  );
  process.exit(1);
}

if (/(^|[@/])(prod|production)/i.test(url)) {
  console.error('Refusing to run: TEST_DATABASE_URL looks like a production database.');
  process.exit(1);
}

// Run through node directly rather than the npx shim, which Node refuses to
// spawn without a shell on Windows.
// Each suite builds and truncates its own tables, so they run in separate
// processes rather than racing over the same database.
const suites = ['src/db/project-service.test.ts', 'src/db/monitor-service.test.ts'];

let failed = 0;

for (const suite of suites) {
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, ['--import', 'tsx', suite], {
      stdio: 'inherit',
      env: process.env,
    });
    child.on('exit', (value) => resolve(value ?? 1));
  });
  if (code !== 0) failed = code;
}

process.exit(failed);
