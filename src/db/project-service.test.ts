/**
 * Integration tests for the project service against a real PostgreSQL database.
 *
 * These exercise the behaviour that cannot be observed without a database:
 * advisory-lock serialisation, transactional imports, optimistic versioning and
 * tenant isolation. They deliberately go through `project-service` rather than
 * the route handlers so no Next.js request plumbing has to be mocked.
 *
 * Requires TEST_DATABASE_URL. Run with: npm run test:db
 *
 * The schema is built in its pre-migration shape and then upgraded with
 * scripts/reliable-saves.sql, so every test also proves that the migration the
 * operator will run in production produces a schema this code works against.
 */
import { before, beforeEach, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error('TEST_DATABASE_URL is required. See scripts/test-db.mjs.');
}
process.env.DATABASE_URL = url;

type Service = typeof import('./project-service');
type ProjectErrorClass = typeof import('../lib/project-validation').ProjectError;

let service: Service;
let ProjectError: ProjectErrorClass;
let sql: postgres.Sql;

const USER = 'user_alice';
const OTHER = 'user_bob';

/** The projects table as it existed before the reliable-saves work. */
const LEGACY_SCHEMA = `
  DROP TABLE IF EXISTS projects;
  DROP TABLE IF EXISTS subscriptions;
  CREATE TABLE projects (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    name text NOT NULL,
    next_action text NOT NULL DEFAULT 'Define the first slice',
    stage text NOT NULL DEFAULT 'Exploring',
    priority text NOT NULL DEFAULT 'Later',
    health text NOT NULL DEFAULT 'On track',
    target_date text,
    last_touched timestamptz NOT NULL,
    created_at timestamptz NOT NULL,
    live_url text,
    repo_url text,
    progress integer NOT NULL DEFAULT 0,
    activity jsonb NOT NULL DEFAULT '[]'::jsonb,
    updated_at timestamptz NOT NULL
  );
  CREATE INDEX projects_user_id_idx ON projects (user_id);
  CREATE INDEX projects_user_priority_idx ON projects (user_id, priority);
  CREATE TABLE subscriptions (
    user_id text PRIMARY KEY,
    stripe_customer_id text,
    stripe_subscription_id text,
    stripe_price_id text,
    plan text NOT NULL DEFAULT 'free',
    status text NOT NULL DEFAULT 'free',
    current_period_end timestamptz,
    cancel_at_period_end integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL
  );
`;

/** Asserts the call fails with a ProjectError carrying this status and code. */
async function fails(
  operation: Promise<unknown>,
  status: number,
  code: string
): Promise<InstanceType<ProjectErrorClass>> {
  try {
    await operation;
  } catch (error) {
    assert.ok(
      error instanceof ProjectError,
      `expected ProjectError, got ${(error as Error)?.message ?? error}`
    );
    const projectError = error as InstanceType<ProjectErrorClass>;
    assert.equal(projectError.status, status, `status (${projectError.message})`);
    assert.equal(projectError.code, code, `code (${projectError.message})`);
    return projectError;
  }
  assert.fail(`expected ${status} ${code} but the operation succeeded`);
}

function projectInput(id: string, extra: Record<string, unknown> = {}) {
  return { id, name: `Project ${id}`, ...extra };
}

function exportable(id: string, extra: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    id,
    name: `Project ${id}`,
    nextAction: 'Ship it',
    stage: 'Building',
    priority: 'Now',
    health: 'On track',
    targetDate: null,
    progress: 10,
    activity: [],
    createdAt: now,
    lastTouched: now,
    ...extra,
  };
}

async function setPlan(userId: string, plan: 'free' | 'pro') {
  await sql`
    INSERT INTO subscriptions (user_id, plan, status, updated_at, created_at)
    VALUES (${userId}, ${plan}, ${plan === 'pro' ? 'active' : 'free'}, now(), now())
    ON CONFLICT (user_id) DO UPDATE SET plan = EXCLUDED.plan, status = EXCLUDED.status
  `;
}

async function seed(userId: string, count: number) {
  for (let i = 0; i < count; i += 1) {
    await service.createProject(userId, projectInput(`${userId}-seed-${i}`));
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Takes the same advisory lock the service uses, on a dedicated connection, and
 * returns a function that releases it by committing.
 */
async function holdAccountLock(userId: string) {
  const reserved = await sql.reserve();
  await reserved`BEGIN`;
  await reserved`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;
  return async () => {
    await reserved`COMMIT`;
    reserved.release();
  };
}

const countFor = async (userId: string) => {
  const rows = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM projects WHERE user_id = ${userId}
  `;
  return rows[0].n;
};

before(async () => {
  sql = postgres(url, { prepare: false, max: 8 });
  await sql.unsafe(LEGACY_SCHEMA);
  await sql.unsafe(readFileSync('scripts/reliable-saves.sql', 'utf8'));
  service = await import('./project-service');
  ProjectError = (await import('../lib/project-validation')).ProjectError;
});

after(async () => {
  await sql?.end({ timeout: 5 });
  await (await import('./index')).closeDb();
});

beforeEach(async () => {
  await sql`TRUNCATE projects, subscriptions`;
});

describe('migration', () => {
  it('adds the reliability columns and is safe to rerun', async () => {
    await sql.unsafe(readFileSync('scripts/reliable-saves.sql', 'utf8'));
    const columns = await sql<{ column_name: string; column_default: string | null }[]>`
      SELECT column_name, column_default FROM information_schema.columns
      WHERE table_name = 'projects' AND column_name IN ('version', 'last_mutation_id')
      ORDER BY column_name
    `;
    assert.equal(columns.length, 2);
    assert.equal(columns[0].column_name, 'last_mutation_id');
    assert.equal(columns[1].column_name, 'version');
    assert.match(columns[1].column_default ?? '', /1/);
  });

  it('starts pre-existing rows at version 1', async () => {
    await sql`
      INSERT INTO projects (id, user_id, name, last_touched, created_at, updated_at)
      VALUES ('legacy1', ${USER}, 'Legacy', now(), now(), now())
    `;
    const { project } = await service.getProject(USER, 'legacy1');
    assert.equal(project.version, 1);
  });
});

describe('createProject', () => {
  it('allows the fifth Free project and refuses the sixth without inserting', async () => {
    await seed(USER, 4);
    const { project } = await service.createProject(USER, projectInput('fifth'));
    assert.equal(project.name, 'Project fifth');
    assert.equal(project.version, 1);
    assert.equal(await countFor(USER), 5);

    await fails(service.createProject(USER, projectInput('sixth')), 402, 'PLAN_LIMIT');
    assert.equal(await countFor(USER), 5);
  });

  it('lets a Pro account pass the Free limit', async () => {
    await setPlan(USER, 'pro');
    await seed(USER, 5);
    await service.createProject(USER, projectInput('sixth'));
    assert.equal(await countFor(USER), 6);
  });

  it('waits for the account lock, and only for that account', async () => {
    // Holding the account's advisory lock externally proves the service takes it:
    // a create for this user must block, while another user's create runs on.
    const release = await holdAccountLock(USER);
    let settled = false;
    const blocked = service
      .createProject(USER, projectInput('blocked'))
      .finally(() => {
        settled = true;
      });
    try {
      await delay(500);
      assert.equal(settled, false, 'create must wait for the account lock');
      await service.createProject(OTHER, projectInput('unblocked'));
      assert.equal(await countFor(OTHER), 1, 'a different account must not be blocked');
    } finally {
      await release();
    }
    await blocked;
    assert.equal(await countFor(USER), 1);
  });

  it('lets only one of several creates queued behind the lock take the last Free slot', async () => {
    await seed(USER, 4);
    // Line every request up behind the lock so they are all released together and
    // genuinely contend for the single remaining slot.
    const release = await holdAccountLock(USER);
    const attempts = Array.from({ length: 6 }, (_, i) =>
      service.createProject(USER, projectInput(`race-${i}`))
    );
    const settled: Promise<PromiseSettledResult<unknown>[]> = Promise.allSettled(attempts);
    await delay(300);
    assert.equal(await countFor(USER), 4, 'no create may land while the lock is held');
    await release();

    const results = await settled;
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    assert.equal(fulfilled.length, 1, 'exactly one create should succeed');
    assert.equal(rejected.length, 5, 'every other create should fail');
    for (const failure of rejected as PromiseRejectedResult[]) {
      assert.ok(failure.reason instanceof ProjectError);
      assert.equal((failure.reason as InstanceType<ProjectErrorClass>).code, 'PLAN_LIMIT');
    }
    assert.equal(await countFor(USER), 5);
  });

  it('treats a repeated create id as the original row', async () => {
    const first = await service.createProject(USER, projectInput('stable'));
    const retry = await service.createProject(USER, projectInput('stable', { name: 'Renamed' }));
    assert.equal(retry.project.id, first.project.id);
    assert.equal(retry.project.name, first.project.name, 'the retry must not overwrite');
    assert.equal(await countFor(USER), 1);
  });

  it('reports a conflict rather than a server error when another tenant owns the id', async () => {
    await service.createProject(OTHER, projectInput('shared-id'));
    await fails(service.createProject(USER, projectInput('shared-id')), 409, 'ID_TAKEN');
    assert.equal(await countFor(USER), 0);
    assert.equal(await countFor(OTHER), 1);
  });

  it('rejects invalid input before touching the database', async () => {
    await fails(service.createProject(USER, projectInput('bad', { stage: 'Nope' })), 400, 'VALIDATION');
    await fails(service.createProject(USER, { name: 'No id' }), 400, 'VALIDATION');
    await fails(service.createProject(USER, projectInput('nameless', { name: '  ' })), 400, 'VALIDATION');
    assert.equal(await countFor(USER), 0);
  });
});

describe('updateProject', () => {
  it('applies a repeated mutation id only once', async () => {
    const { project } = await service.createProject(USER, projectInput('p1'));
    const payload = { version: project.version, mutationId: 'mut-1', name: 'First save' };
    const first = await service.updateProject(USER, 'p1', payload);
    assert.equal(first.project.version, 2);
    assert.equal(first.project.name, 'First save');

    const retry = await service.updateProject(USER, 'p1', payload);
    assert.equal(retry.project.version, 2, 'a retried mutation must not bump the version');
    assert.equal(retry.project.name, 'First save');
  });

  it('lets one of two edits from the same version win and conflicts the other', async () => {
    const { project } = await service.createProject(USER, projectInput('p1'));
    const version = project.version;
    await service.updateProject(USER, 'p1', { version, mutationId: 'mut-a', name: 'A wins' });
    await fails(
      service.updateProject(USER, 'p1', { version, mutationId: 'mut-b', name: 'B loses' }),
      409,
      'CONFLICT'
    );
    const { project: after } = await service.getProject(USER, 'p1');
    assert.equal(after.name, 'A wins');
    assert.equal(after.version, 2);
  });

  it('rejects an update with a missing or malformed version', async () => {
    await service.createProject(USER, projectInput('p1'));
    await fails(service.updateProject(USER, 'p1', { mutationId: 'm', name: 'x' }), 400, 'VALIDATION');
    await fails(
      service.updateProject(USER, 'p1', { version: 0, mutationId: 'm', name: 'x' }),
      400,
      'VALIDATION'
    );
    await fails(service.updateProject(USER, 'p1', { version: 1, name: 'x' }), 400, 'VALIDATION');
  });

  it('clears a URL when null is sent and keeps untouched fields', async () => {
    const { project } = await service.createProject(
      USER,
      projectInput('p1', { liveUrl: 'https://example.com', nextAction: 'Keep me' })
    );
    const { project: cleared } = await service.updateProject(USER, 'p1', {
      version: project.version,
      mutationId: 'm1',
      liveUrl: null,
    });
    assert.equal(cleared.liveUrl, undefined);
    assert.equal(cleared.nextAction, 'Keep me');
  });

  it('returns 404 for a project that does not exist', async () => {
    await fails(
      service.updateProject(USER, 'ghost', { version: 1, mutationId: 'm', name: 'x' }),
      404,
      'NOT_FOUND'
    );
  });
});

describe('deleteProject', () => {
  it('conflicts on a stale version and succeeds when repeated after deleting', async () => {
    const { project } = await service.createProject(USER, projectInput('p1'));
    await service.updateProject(USER, 'p1', {
      version: project.version,
      mutationId: 'm1',
      name: 'Moved on',
    });

    await fails(service.deleteProject(USER, 'p1', { version: project.version }), 409, 'CONFLICT');
    assert.equal(await countFor(USER), 1);

    await service.deleteProject(USER, 'p1', { version: 2 });
    assert.equal(await countFor(USER), 0);
    // A retry of a delete whose response was lost must not fail.
    await service.deleteProject(USER, 'p1', { version: 2 });
    assert.equal(await countFor(USER), 0);
  });
});

describe('importProjects', () => {
  const versionsOf = async (userId: string) => {
    const rows = await sql<{ id: string; version: number }[]>`
      SELECT id, version FROM projects WHERE user_id = ${userId}
    `;
    return Object.fromEntries(rows.map((r) => [r.id, r.version]));
  };

  it('imports exactly the Free limit', async () => {
    const projects = Array.from({ length: 5 }, (_, i) => exportable(`imp${i}`));
    const result = await service.importProjects(USER, { projects, versions: {} });
    assert.equal(result.projects.length, 5);
    assert.equal(await countFor(USER), 5);
    assert.ok(result.projects.every((p) => p.version === 1));
  });

  it('changes nothing when the import exceeds the Free limit', async () => {
    await seed(USER, 2);
    const before = await versionsOf(USER);
    const projects = Array.from({ length: 6 }, (_, i) => exportable(`imp${i}`));
    await fails(
      service.importProjects(USER, { projects, versions: before }),
      402,
      'PLAN_LIMIT'
    );
    assert.deepEqual(await versionsOf(USER), before);
  });

  it('changes nothing when a single imported project is invalid', async () => {
    await seed(USER, 2);
    const before = await versionsOf(USER);
    const projects = [exportable('ok1'), exportable('bad1', { progress: 250 })];
    await fails(service.importProjects(USER, { projects, versions: before }), 400, 'VALIDATION');
    assert.deepEqual(await versionsOf(USER), before);
  });

  it('changes nothing when the workspace moved since the snapshot', async () => {
    await seed(USER, 1);
    const before = await versionsOf(USER);
    const stale = Object.fromEntries(Object.entries(before).map(([id, v]) => [id, v + 5]));
    await fails(
      service.importProjects(USER, { projects: [exportable('new1')], versions: stale }),
      409,
      'CONFLICT'
    );
    assert.deepEqual(await versionsOf(USER), before);

    // A snapshot missing a project the server has is drift too.
    await fails(
      service.importProjects(USER, { projects: [exportable('new1')], versions: {} }),
      409,
      'CONFLICT'
    );
    assert.deepEqual(await versionsOf(USER), before);
  });

  it('rolls back the delete when an insert fails mid-import', async () => {
    await seed(USER, 2);
    const before = await versionsOf(USER);
    await sql`ALTER TABLE projects ADD CONSTRAINT test_reject_boom CHECK (name <> 'BOOM')`;
    try {
      await assert.rejects(
        service.importProjects(USER, {
          projects: [exportable('ok1'), exportable('boom1', { name: 'BOOM' })],
          versions: before,
        })
      );
      // The workspace was emptied inside the transaction; rollback must restore it.
      assert.deepEqual(await versionsOf(USER), before);
    } finally {
      await sql`ALTER TABLE projects DROP CONSTRAINT test_reject_boom`;
    }
  });

  it('bumps the version of reused ids so other tabs still detect the change', async () => {
    const { project } = await service.createProject(USER, projectInput('keep'));
    assert.equal(project.version, 1);
    const result = await service.importProjects(USER, {
      projects: [exportable('keep', { name: 'Imported over' })],
      versions: { keep: 1 },
    });
    assert.equal(result.projects[0].version, 2);
    await fails(
      service.updateProject(USER, 'keep', { version: 1, mutationId: 'm', name: 'stale write' }),
      409,
      'CONFLICT'
    );
  });

  it('clears the workspace when given an empty list', async () => {
    await seed(USER, 3);
    const versions = await versionsOf(USER);
    const result = await service.importProjects(USER, { projects: [], versions });
    assert.equal(result.projects.length, 0);
    assert.equal(await countFor(USER), 0);
  });

  it('accepts an older export that has no version, progress or activity fields', async () => {
    const now = new Date().toISOString();
    const legacy = {
      id: 'old1',
      name: 'From an old export',
      nextAction: 'Do the thing',
      stage: 'Building',
      priority: 'Next',
      health: 'On track',
      targetDate: null,
      createdAt: now,
      lastTouched: now,
    };
    const result = await service.importProjects(USER, { projects: [legacy], versions: {} });
    assert.equal(result.projects.length, 1);
    assert.equal(result.projects[0].version, 1, 'imports get a valid server version');
    assert.equal(result.projects[0].progress, 0);
    assert.deepEqual(result.projects[0].activity, []);
  });

  it('truncates an over-long activity history instead of rejecting the file', async () => {
    const activity = Array.from({ length: 80 }, (_, i) => ({
      id: `a${i}`,
      type: 'comment',
      message: `entry ${i}`,
      timestamp: new Date().toISOString(),
    }));
    const result = await service.importProjects(USER, {
      projects: [exportable('long1', { activity })],
      versions: {},
    });
    assert.equal(result.projects[0].activity.length, 50);
    assert.equal(result.projects[0].activity[0].id, 'a0');
  });

  it('refuses an import that would claim another tenant’s project id', async () => {
    await service.createProject(OTHER, projectInput('shared-id'));
    await seed(USER, 1);
    const before = await versionsOf(USER);
    await fails(
      service.importProjects(USER, {
        projects: [exportable('shared-id')],
        versions: before,
      }),
      409,
      'ID_TAKEN'
    );
    assert.deepEqual(await versionsOf(USER), before);
    assert.equal(await countFor(OTHER), 1);
  });

  it('rejects duplicate ids inside one import', async () => {
    await fails(
      service.importProjects(USER, {
        projects: [exportable('dup'), exportable('dup')],
        versions: {},
      }),
      400,
      'VALIDATION'
    );
    assert.equal(await countFor(USER), 0);
  });

  it('requires a versions snapshot', async () => {
    await fails(service.importProjects(USER, { projects: [] }), 400, 'VALIDATION');
  });
});

describe('tenant isolation', () => {
  it('hides, refuses and preserves another user’s project', async () => {
    const { project } = await service.createProject(OTHER, projectInput('bobs'));

    const list = await service.listProjects(USER);
    assert.equal(list.projects.length, 0, 'another tenant’s project must not be listed');

    await fails(service.getProject(USER, 'bobs'), 404, 'NOT_FOUND');
    await fails(
      service.updateProject(USER, 'bobs', {
        version: project.version,
        mutationId: 'm',
        name: 'Hijacked',
      }),
      404,
      'NOT_FOUND'
    );

    // A delete of something you cannot see is a no-op, never a cross-tenant delete.
    await service.deleteProject(USER, 'bobs', { version: project.version });
    const { project: untouched } = await service.getProject(OTHER, 'bobs');
    assert.equal(untouched.name, 'Project bobs');
    assert.equal(untouched.version, 1);

    // Importing an empty workspace must not reach across tenants either.
    await service.importProjects(USER, { projects: [], versions: {} });
    assert.equal(await countFor(OTHER), 1);
  });

  it('scopes the plan limit to the acting user', async () => {
    await seed(OTHER, 5);
    await service.createProject(USER, projectInput('mine'));
    assert.equal(await countFor(USER), 1);
  });
});
