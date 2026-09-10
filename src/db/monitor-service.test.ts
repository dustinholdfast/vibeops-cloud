/**
 * Integration tests for the uptime monitor service against a real PostgreSQL
 * database.
 *
 * These cover what unit tests cannot see: that `scripts/uptime-monitors.sql`
 * produces a schema this code works against, that "due" is computed correctly
 * in SQL, and that the raw-SQL preference reads behave. The pure rules —
 * what may be pinged, when something is down, how uptime is summarised — are
 * tested without a database in `src/lib/uptime/*.test.ts`.
 *
 * Requires TEST_DATABASE_URL. Run with: npm run test:db
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

type Service = typeof import('./monitor-service');
type Scope = import('./project-service').Scope;
type WorkspaceRole = import('../lib/workspace-roles').WorkspaceRole;

let service: Service;
let sql: postgres.Sql;

const USER = 'user_alice';
const OTHER = 'user_bob';
const TEAM = 'ws_team';

function scope(workspaceId: string, userId = USER, role: WorkspaceRole = 'owner'): Scope {
  return {
    userId,
    workspace: {
      workspaceId,
      name: workspaceId === userId ? 'Personal' : 'Team',
      personal: workspaceId === userId,
      ownerUserId: userId,
      role,
    },
  };
}

const BASE_SCHEMA = `
  DROP TABLE IF EXISTS project_checks;
  DROP TABLE IF EXISTS project_monitors;
  DROP TABLE IF EXISTS email_preferences;
  DROP TABLE IF EXISTS projects;
  CREATE TABLE projects (
    id text PRIMARY KEY,
    version integer NOT NULL DEFAULT 1,
    last_mutation_id text,
    workspace_id text NOT NULL,
    user_id text NOT NULL,
    name text NOT NULL,
    next_action text NOT NULL DEFAULT 'Define the first slice',
    stage text NOT NULL DEFAULT 'Exploring',
    priority text NOT NULL DEFAULT 'Later',
    health text NOT NULL DEFAULT 'On track',
    target_date text,
    last_touched timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    live_url text,
    repo_url text,
    progress integer NOT NULL DEFAULT 0,
    activity jsonb NOT NULL DEFAULT '[]'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
  );
`;

async function addProject(id: string, workspaceId: string, liveUrl: string | null = null) {
  await sql`
    INSERT INTO projects (id, workspace_id, user_id, name, live_url)
    VALUES (${id}, ${workspaceId}, ${USER}, ${'Project ' + id}, ${liveUrl})
  `;
}

/** Backdates a monitor's last check so it becomes due. */
async function lastCheckedSecondsAgo(projectId: string, seconds: number) {
  await sql`
    UPDATE project_monitors
       SET last_checked_at = now() - make_interval(secs => ${seconds})
     WHERE project_id = ${projectId}
  `;
}

before(async () => {
  sql = postgres(url, { prepare: false, max: 8 });
  await sql.unsafe(BASE_SCHEMA);
  await sql.unsafe(readFileSync('scripts/team-workspaces.sql', 'utf8'));
  await sql.unsafe(readFileSync('scripts/email-preferences.sql', 'utf8'));
  await sql.unsafe(readFileSync('scripts/uptime-monitors.sql', 'utf8'));
  service = await import('./monitor-service');
});

after(async () => {
  await sql?.end({ timeout: 5 });
  await (await import('./index')).closeDb();
});

beforeEach(async () => {
  await sql`TRUNCATE projects, project_monitors, project_checks, email_preferences, workspaces, workspace_members`;
});

describe('the migration', () => {
  it('creates both tables and the alerts column, and is safe to rerun', async () => {
    await sql.unsafe(readFileSync('scripts/uptime-monitors.sql', 'utf8'));

    const tables = await sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_name IN ('project_monitors', 'project_checks')
      ORDER BY table_name
    `;
    assert.deepEqual(
      tables.map((t) => t.table_name),
      ['project_checks', 'project_monitors']
    );

    const [column] = await sql<{ column_default: string | null }[]>`
      SELECT column_default FROM information_schema.columns
      WHERE table_name = 'email_preferences' AND column_name = 'uptime_alerts'
    `;
    assert.ok(column, 'uptime_alerts was added');
    assert.match(column.column_default ?? '', /1/);
  });

  it('reports storage as ready', async () => {
    assert.equal(await service.monitorStorageReady(), true);
    assert.equal(await service.alertStorageReady(), true);
  });
});

describe('saving a monitor', () => {
  it('falls back to the project live URL', async () => {
    await addProject('p1', USER, 'https://example.com/');
    const monitor = await service.saveMonitor(scope(USER), 'p1', {});

    assert.equal(monitor.url, 'https://example.com/');
    assert.equal(monitor.enabled, true);
    assert.equal(monitor.status, 'unknown');
    assert.equal(monitor.intervalSeconds, 300);
  });

  it('refuses a private address', async () => {
    await addProject('p1', USER);
    await assert.rejects(
      () => service.saveMonitor(scope(USER), 'p1', { url: 'http://127.0.0.1:3000/' }),
      /Private and local/
    );
  });

  it('refuses a project in another workspace', async () => {
    await addProject('p1', OTHER, 'https://example.com/');
    await assert.rejects(
      () => service.saveMonitor(scope(USER), 'p1', { url: 'https://example.com/' }),
      /not available/
    );
  });

  it('refuses a viewer', async () => {
    await addProject('p1', TEAM, 'https://example.com/');
    await assert.rejects(
      () => service.saveMonitor(scope(TEAM, USER, 'viewer'), 'p1', {}),
      /view-only/
    );
  });

  it('clamps an absurd interval instead of storing it', async () => {
    await addProject('p1', USER, 'https://example.com/');
    const monitor = await service.saveMonitor(scope(USER), 'p1', { intervalSeconds: 1 });
    assert.equal(monitor.intervalSeconds, 60);
  });

  it('clears history when the URL changes', async () => {
    await addProject('p1', USER, 'https://example.com/');
    await service.saveMonitor(scope(USER), 'p1', {});
    await service.recordCheck(
      'p1',
      { ok: true, statusCode: 200, latencyMs: 50, error: null },
      { status: 'up', consecutiveFailures: 0, consecutiveSuccesses: 1, alert: null }
    );

    const before = await sql`SELECT 1 FROM project_checks WHERE project_id = 'p1'`;
    assert.equal(before.length, 1);

    const moved = await service.saveMonitor(scope(USER), 'p1', {
      url: 'https://elsewhere.example/',
    });
    assert.equal(moved.status, 'unknown');
    assert.equal(moved.lastCheckedAt, null);

    const after = await sql`SELECT 1 FROM project_checks WHERE project_id = 'p1'`;
    assert.equal(after.length, 0, 'history would be measuring something else');
  });

  it('keeps history when only the interval changes', async () => {
    await addProject('p1', USER, 'https://example.com/');
    await service.saveMonitor(scope(USER), 'p1', {});
    await service.recordCheck(
      'p1',
      { ok: true, statusCode: 200, latencyMs: 50, error: null },
      { status: 'up', consecutiveFailures: 0, consecutiveSuccesses: 1, alert: null }
    );

    await service.saveMonitor(scope(USER), 'p1', { intervalSeconds: 900 });
    const rows = await sql`SELECT 1 FROM project_checks WHERE project_id = 'p1'`;
    assert.equal(rows.length, 1);
  });
});

describe('finding what is due', () => {
  it('includes a monitor that has never run', async () => {
    await addProject('p1', USER, 'https://example.com/');
    await service.saveMonitor(scope(USER), 'p1', {});

    const due = await service.dueMonitors();
    assert.equal(due.length, 1);
    assert.equal(due[0].projectId, 'p1');
    assert.equal(due[0].projectName, 'Project p1');
  });

  it('waits out the interval', async () => {
    await addProject('p1', USER, 'https://example.com/');
    await service.saveMonitor(scope(USER), 'p1', { intervalSeconds: 300 });

    await lastCheckedSecondsAgo('p1', 60);
    assert.equal((await service.dueMonitors()).length, 0, 'checked a minute ago');

    await lastCheckedSecondsAgo('p1', 600);
    assert.equal((await service.dueMonitors()).length, 1, 'checked ten minutes ago');
  });

  it('skips a paused monitor', async () => {
    await addProject('p1', USER, 'https://example.com/');
    await service.saveMonitor(scope(USER), 'p1', { enabled: false });
    assert.equal((await service.dueMonitors()).length, 0);
  });

  it('skips a monitor whose project has been deleted', async () => {
    await addProject('p1', USER, 'https://example.com/');
    await service.saveMonitor(scope(USER), 'p1', {});
    await sql`DELETE FROM projects WHERE id = 'p1'`;
    assert.equal((await service.dueMonitors()).length, 0);
  });
});

describe('recording a check', () => {
  it('writes the row and moves the monitor state', async () => {
    await addProject('p1', USER, 'https://example.com/');
    await service.saveMonitor(scope(USER), 'p1', {});

    await service.recordCheck(
      'p1',
      { ok: false, statusCode: 503, latencyMs: 80, error: 'HTTP 503' },
      { status: 'down', consecutiveFailures: 2, consecutiveSuccesses: 0, alert: 'down' }
    );

    const [monitor] = await sql<
      { status: string; consecutive_failures: number; last_error: string | null; last_status_change_at: Date | null }[]
    >`SELECT status, consecutive_failures, last_error, last_status_change_at
        FROM project_monitors WHERE project_id = 'p1'`;

    assert.equal(monitor.status, 'down');
    assert.equal(monitor.consecutive_failures, 2);
    assert.equal(monitor.last_error, 'HTTP 503');
    assert.ok(monitor.last_status_change_at, 'an alert stamps the state change');
  });

  it('clears the error on recovery', async () => {
    await addProject('p1', USER, 'https://example.com/');
    await service.saveMonitor(scope(USER), 'p1', {});

    await service.recordCheck(
      'p1',
      { ok: false, statusCode: 503, latencyMs: 80, error: 'HTTP 503' },
      { status: 'down', consecutiveFailures: 1, consecutiveSuccesses: 0, alert: 'down' }
    );
    await service.recordCheck(
      'p1',
      { ok: true, statusCode: 200, latencyMs: 60, error: null },
      { status: 'up', consecutiveFailures: 0, consecutiveSuccesses: 1, alert: 'up' }
    );

    const [monitor] = await sql<{ status: string; last_error: string | null }[]>`
      SELECT status, last_error FROM project_monitors WHERE project_id = 'p1'
    `;
    assert.equal(monitor.status, 'up');
    assert.equal(monitor.last_error, null);
  });
});

describe('the snapshot', () => {
  it('summarises the windows and returns a 48-bucket day', async () => {
    await addProject('p1', USER, 'https://example.com/');
    await service.saveMonitor(scope(USER), 'p1', {});

    for (const ok of [true, true, true, false]) {
      await service.recordCheck(
        'p1',
        { ok, statusCode: ok ? 200 : 500, latencyMs: 100, error: ok ? null : 'HTTP 500' },
        {
          status: ok ? 'up' : 'down',
          consecutiveFailures: ok ? 0 : 1,
          consecutiveSuccesses: ok ? 1 : 0,
          alert: null,
        }
      );
    }

    const snapshot = await service.getMonitorSnapshot(scope(USER), 'p1');
    assert.equal(snapshot.monitor?.projectId, 'p1');
    assert.equal(snapshot.windows.day.checks, 4);
    assert.equal(snapshot.windows.day.failures, 1);
    assert.equal(snapshot.windows.day.uptimePct, 75);
    assert.equal(snapshot.buckets.length, 48);
    assert.equal(snapshot.recent.length, 4);
  });

  it('returns a null monitor rather than failing when there is none', async () => {
    await addProject('p1', USER);
    const snapshot = await service.getMonitorSnapshot(scope(USER), 'p1');
    assert.equal(snapshot.monitor, null);
    assert.equal(snapshot.windows.day.uptimePct, null);
  });

  it('will not read across workspaces', async () => {
    await addProject('p1', OTHER, 'https://example.com/');
    await assert.rejects(
      () => service.getMonitorSnapshot(scope(USER), 'p1'),
      /not available/
    );
  });
});

describe('who gets alerted', () => {
  it('is the owner for a personal workspace with no preferences row', async () => {
    assert.deepEqual(await service.alertRecipients(USER), [USER]);
  });

  it('respects a personal opt-out', async () => {
    await sql`
      INSERT INTO email_preferences (user_id, unsubscribe_token, uptime_alerts)
      VALUES (${USER}, 'tok', 0)
    `;
    assert.deepEqual(await service.alertRecipients(USER), []);
  });

  it('is every member of a team workspace', async () => {
    await sql`INSERT INTO workspaces (id, name, owner_user_id, created_at, updated_at)
              VALUES (${TEAM}, 'Team', ${USER}, now(), now())`;
    await sql`INSERT INTO workspace_members (workspace_id, user_id, role, created_at, updated_at)
              VALUES (${TEAM}, ${USER}, 'owner', now(), now()),
                     (${TEAM}, ${OTHER}, 'member', now(), now())`;

    const recipients = (await service.alertRecipients(TEAM)).sort();
    assert.deepEqual(recipients, [USER, OTHER].sort());
  });

  it('drops a member who opted out but keeps the rest', async () => {
    await sql`INSERT INTO workspaces (id, name, owner_user_id, created_at, updated_at)
              VALUES (${TEAM}, 'Team', ${USER}, now(), now())`;
    await sql`INSERT INTO workspace_members (workspace_id, user_id, role, created_at, updated_at)
              VALUES (${TEAM}, ${USER}, 'owner', now(), now()),
                     (${TEAM}, ${OTHER}, 'member', now(), now())`;
    await sql`INSERT INTO email_preferences (user_id, unsubscribe_token, uptime_alerts)
              VALUES (${OTHER}, 'tok2', 0)`;

    assert.deepEqual(await service.alertRecipients(TEAM), [USER]);
  });

  it('returns nobody when every member of a team opted out', async () => {
    await sql`INSERT INTO workspaces (id, name, owner_user_id, created_at, updated_at)
              VALUES (${TEAM}, 'Team', ${USER}, now(), now())`;
    await sql`INSERT INTO workspace_members (workspace_id, user_id, role, created_at, updated_at)
              VALUES (${TEAM}, ${USER}, 'owner', now(), now())`;
    await sql`INSERT INTO email_preferences (user_id, unsubscribe_token, uptime_alerts)
              VALUES (${USER}, 'tok3', 0)`;

    // Must not fall through to the personal-workspace branch and mail the
    // workspace id as though it were a user.
    assert.deepEqual(await service.alertRecipients(TEAM), []);
  });
});

describe('preferences and unsubscribing', () => {
  beforeEach(async () => {
    await sql`INSERT INTO email_preferences (user_id, unsubscribe_token)
              VALUES (${USER}, ${'a'.repeat(48)})`;
  });

  it('defaults to on and can be turned off', async () => {
    assert.equal(await service.getUptimeAlerts(USER), true);
    await service.setUptimeAlerts(USER, false);
    assert.equal(await service.getUptimeAlerts(USER), false);
  });

  it('unsubscribes by token without touching the weekly digest', async () => {
    assert.equal(await service.unsubscribeAlertsByToken('a'.repeat(48)), true);

    const [row] = await sql<{ uptime_alerts: number; weekly_digest: number }[]>`
      SELECT uptime_alerts, weekly_digest FROM email_preferences WHERE user_id = ${USER}
    `;
    assert.equal(row.uptime_alerts, 0);
    assert.equal(row.weekly_digest, 1, 'the digest is a separate list');
  });

  it('rejects a malformed token', async () => {
    assert.equal(await service.unsubscribeAlertsByToken('nope'), false);
  });
});

describe('retention', () => {
  it('drops checks past the window and keeps recent ones', async () => {
    await addProject('p1', USER, 'https://example.com/');
    await service.saveMonitor(scope(USER), 'p1', {});

    await sql`
      INSERT INTO project_checks (project_id, checked_at, ok)
      VALUES ('p1', now() - interval '40 days', 1),
             ('p1', now() - interval '1 day', 1)
    `;

    const removed = await service.pruneChecks();
    assert.equal(removed, 1);

    const rows = await sql`SELECT 1 FROM project_checks WHERE project_id = 'p1'`;
    assert.equal(rows.length, 1);
  });
});

describe('the manual check', () => {
  it('returns the monitor in the shape the sweep uses', async () => {
    await addProject('p1', USER, 'https://example.com/');
    await service.saveMonitor(scope(USER), 'p1', {});

    const monitor = await service.monitorForCheck(scope(USER), 'p1');
    assert.equal(monitor.projectId, 'p1');
    assert.equal(monitor.projectName, 'Project p1');
    assert.equal(monitor.url, 'https://example.com/');
    assert.equal(monitor.status, 'unknown');
  });

  it('refuses when the project is not monitored', async () => {
    await addProject('p1', USER, 'https://example.com/');
    await assert.rejects(
      () => service.monitorForCheck(scope(USER), 'p1'),
      /not being monitored/
    );
  });

  it('refuses a project in another workspace', async () => {
    await addProject('p1', OTHER, 'https://example.com/');
    await assert.rejects(() => service.monitorForCheck(scope(USER), 'p1'), /not available/);
  });

  it('refuses a viewer', async () => {
    await addProject('p1', TEAM, 'https://example.com/');
    await service.saveMonitor(scope(TEAM), 'p1', {});
    await assert.rejects(
      () => service.monitorForCheck(scope(TEAM, USER, 'viewer'), 'p1'),
      /view-only/
    );
  });

  it('enforces a cooldown so the button cannot hammer the target', async () => {
    await addProject('p1', USER, 'https://example.com/');
    await service.saveMonitor(scope(USER), 'p1', {});
    await service.recordCheck(
      'p1',
      { ok: true, statusCode: 200, latencyMs: 20, error: null },
      { status: 'up', consecutiveFailures: 0, consecutiveSuccesses: 1, alert: null }
    );

    await assert.rejects(() => service.monitorForCheck(scope(USER), 'p1'), /Just checked/);
  });

  it('allows a check once the cooldown has passed', async () => {
    await addProject('p1', USER, 'https://example.com/');
    await service.saveMonitor(scope(USER), 'p1', {});
    await service.recordCheck(
      'p1',
      { ok: true, statusCode: 200, latencyMs: 20, error: null },
      { status: 'up', consecutiveFailures: 0, consecutiveSuccesses: 1, alert: null }
    );

    const later = new Date(Date.now() + service.MANUAL_CHECK_COOLDOWN_MS + 1_000);
    const monitor = await service.monitorForCheck(scope(USER), 'p1', later);
    assert.equal(monitor.status, 'up');
  });

  it('is allowed on a paused monitor, which the sweep would skip', async () => {
    await addProject('p1', USER, 'https://example.com/');
    await service.saveMonitor(scope(USER), 'p1', { enabled: false });

    // Pausing stops the schedule; asking directly is still reasonable.
    const monitor = await service.monitorForCheck(scope(USER), 'p1');
    assert.equal(monitor.projectId, 'p1');
    assert.equal((await service.dueMonitors()).length, 0);
  });
});

describe('deleting a monitor', () => {
  it('removes the monitor and its history', async () => {
    await addProject('p1', USER, 'https://example.com/');
    await service.saveMonitor(scope(USER), 'p1', {});
    await service.recordCheck(
      'p1',
      { ok: true, statusCode: 200, latencyMs: 10, error: null },
      { status: 'up', consecutiveFailures: 0, consecutiveSuccesses: 1, alert: null }
    );

    assert.deepEqual(await service.deleteMonitor(scope(USER), 'p1'), { deleted: true });
    assert.equal((await sql`SELECT 1 FROM project_monitors`).length, 0);
    assert.equal((await sql`SELECT 1 FROM project_checks`).length, 0);
  });
});
