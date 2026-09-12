import { and, desc, eq, gte, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { requireDb, resetDb } from './index';
import { projectChecks, projectMonitors, projects } from './schema';
import { ProjectError } from '../lib/project-validation';
import { can } from '../lib/workspace-roles';
import type { Scope } from './project-service';
import { validateTarget } from '../lib/uptime/target';
import {
  DEFAULT_FAILURE_THRESHOLD,
  type MonitorStatus,
  type Transition,
} from '../lib/uptime/status';
import {
  bucketize,
  currentStreakMs,
  summarise,
  uptimeFromCounts,
  type Bucket,
  type CheckRecord,
  type UptimeSummary,
} from '../lib/uptime/history';

/**
 * Storage for uptime monitors and their check history.
 *
 * Deliberately isolated from the project request path: a missing migration
 * disables monitoring (see `monitorStorageReady`) rather than breaking the
 * dashboard, which is how the weekly digest handles the same problem.
 */

/** How long check rows are kept. Long enough for a 30-day uptime figure. */
export const RETENTION_DAYS = 35;

const MIN_INTERVAL_SECONDS = 60;
const MAX_INTERVAL_SECONDS = 86_400;
const DAY_MS = 24 * 60 * 60 * 1000;

export type MonitorView = {
  projectId: string;
  url: string;
  enabled: boolean;
  intervalSeconds: number;
  failureThreshold: number;
  status: MonitorStatus;
  lastCheckedAt: string | null;
  lastStatusChangeAt: string | null;
  lastError: string | null;
};

export type CheckView = {
  checkedAt: string;
  ok: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  error: string | null;
};

export type MonitorSnapshot = {
  monitor: MonitorView | null;
  windows: { day: UptimeSummary; week: UptimeSummary; month: UptimeSummary };
  /** 48 half-hourly buckets: the status strip for the last 24 hours. */
  buckets: Bucket[];
  /** How long the current up/down run has lasted, in ms. */
  streakMs: number | null;
  recent: CheckView[];
};

export type MonitorInput = {
  url?: unknown;
  enabled?: unknown;
  intervalSeconds?: unknown;
  failureThreshold?: unknown;
};

/** A monitor plus everything the cron needs to check it and alert on it. */
export type DueMonitor = {
  projectId: string;
  workspaceId: string;
  projectName: string;
  url: string;
  timeoutMs: number;
  failureThreshold: number;
  status: MonitorStatus;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  /** When it last changed state, so a recovery can say how long it was down. */
  lastStatusChangeAt: Date | null;
};

/**
 * Whether the monitoring tables exist. Called before any monitoring work so an
 * unapplied migration reads as "not set up" rather than a 500.
 */
export async function monitorStorageReady(): Promise<boolean> {
  try {
    await requireDb().execute(sql`select 1 from project_monitors limit 1`);
    return true;
  } catch (error) {
    // 42P01, undefined_table: the migration genuinely has not run.
    if ((error as { code?: unknown })?.code === '42P01') return false;

    /**
     * Anything else is not a missing migration and must not be reported as
     * one. An unreachable database, a rejected password or an exhausted
     * connection limit would otherwise surface as "monitoring is not set up",
     * sending whoever is debugging to look at schema instead of the network.
     * On Workers that is the more likely failure of the two.
     */
    resetDb();
    throw error;
  }
}

function toView(row: typeof projectMonitors.$inferSelect): MonitorView {
  return {
    projectId: row.projectId,
    url: row.url,
    enabled: row.enabled === 1,
    intervalSeconds: row.intervalSeconds,
    failureThreshold: row.failureThreshold,
    status: row.status as MonitorStatus,
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    lastStatusChangeAt: row.lastStatusChangeAt?.toISOString() ?? null,
    lastError: row.lastError,
  };
}

/**
 * Proves the project is in the caller's workspace before anything else runs.
 * Monitors are addressed by project id, so this is the only tenant boundary.
 */
async function requireProject(scope: Scope, projectId: string) {
  const [row] = await requireDb()
    .select({ id: projects.id, name: projects.name, liveUrl: projects.liveUrl })
    .from(projects)
    .where(
      and(eq(projects.id, projectId), eq(projects.workspaceId, scope.workspace.workspaceId))
    );

  if (!row) throw new ProjectError(404, 'NOT_FOUND', 'That project is not available.');
  return row;
}

function requireWrite(scope: Scope) {
  if (!can(scope.workspace.role, 'edit:projects')) {
    throw new ProjectError(403, 'FORBIDDEN', 'You have view-only access to this workspace.');
  }
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  if (value === undefined || value === null) return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

/** History for one project, already shaped for the drawer. */
export async function getMonitorSnapshot(
  scope: Scope,
  projectId: string,
  now: Date = new Date()
): Promise<MonitorSnapshot> {
  await requireProject(scope, projectId);
  const db = requireDb();

  const [row] = await db
    .select()
    .from(projectMonitors)
    .where(eq(projectMonitors.projectId, projectId));

  const monthAgo = new Date(now.getTime() - 30 * DAY_MS);
  // ISO bound, not Date — same Workers/postgres.js trap as dueMonitors.
  const monthStart = sql`${monthAgo.toISOString()}::timestamptz`;
  const rows = await db
    .select({
      checkedAt: projectChecks.checkedAt,
      ok: projectChecks.ok,
      statusCode: projectChecks.statusCode,
      latencyMs: projectChecks.latencyMs,
      error: projectChecks.error,
    })
    .from(projectChecks)
    .where(and(eq(projectChecks.projectId, projectId), sql`${projectChecks.checkedAt} >= ${monthStart}`))
    .orderBy(desc(projectChecks.checkedAt))
    .limit(5000);

  const records: CheckRecord[] = rows.map((r) => ({
    checkedAt: r.checkedAt,
    ok: r.ok === 1,
    latencyMs: r.latencyMs,
  }));

  return {
    monitor: row ? toView(row) : null,
    windows: {
      day: summarise(records, new Date(now.getTime() - DAY_MS), now),
      week: summarise(records, new Date(now.getTime() - 7 * DAY_MS), now),
      month: summarise(records, monthAgo, now),
    },
    buckets: bucketize(records, new Date(now.getTime() - DAY_MS), now, 48),
    streakMs: currentStreakMs(records, now),
    recent: rows.slice(0, 20).map((r) => ({
      checkedAt: r.checkedAt.toISOString(),
      ok: r.ok === 1,
      statusCode: r.statusCode,
      latencyMs: r.latencyMs,
      error: r.error,
    })),
  };
}

/**
 * Creates or updates the monitor for a project.
 *
 * The URL falls back to the project's own live URL, which is almost always what
 * someone means by "monitor this project".
 */
export async function saveMonitor(
  scope: Scope,
  projectId: string,
  input: MonitorInput
): Promise<MonitorView> {
  requireWrite(scope);
  const project = await requireProject(scope, projectId);
  const db = requireDb();

  const [existing] = await db
    .select()
    .from(projectMonitors)
    .where(eq(projectMonitors.projectId, projectId));

  const rawUrl = input.url ?? existing?.url ?? project.liveUrl;
  const target = validateTarget(rawUrl);
  if (!target.ok) throw new ProjectError(400, 'VALIDATION', target.reason);

  const enabled = typeof input.enabled === 'boolean' ? input.enabled : existing?.enabled !== 0;
  const intervalSeconds = clampInt(
    input.intervalSeconds,
    existing?.intervalSeconds ?? 300,
    MIN_INTERVAL_SECONDS,
    MAX_INTERVAL_SECONDS
  );
  const failureThreshold = clampInt(
    input.failureThreshold,
    existing?.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD,
    1,
    10
  );

  const at = new Date().toISOString();
  // Pointing a monitor somewhere else makes its history meaningless, so the
  // state resets rather than carrying "down" across to a different target.
  const retargeted = Boolean(existing) && existing.url !== target.url;

  const status = retargeted ? 'unknown' : (existing?.status ?? 'unknown');
  const consecutiveFailures = retargeted ? 0 : (existing?.consecutiveFailures ?? 0);
  const consecutiveSuccesses = retargeted ? 0 : (existing?.consecutiveSuccesses ?? 0);
  const lastCheckedAt = retargeted ? null : (existing?.lastCheckedAt?.toISOString() ?? null);
  const lastStatusChangeAt = retargeted
    ? null
    : (existing?.lastStatusChangeAt?.toISOString() ?? null);
  const lastError = retargeted ? null : (existing?.lastError ?? null);
  const createdAt = existing?.createdAt?.toISOString() ?? at;
  const timeoutMs = existing?.timeoutMs ?? 10_000;
  const workspaceId = scope.workspace.workspaceId;

  /**
   * Upsert with ISO timestamps via sql. Drizzle Date bindings on Workers have
   * already poisoned isolates (same class of bug as recordCheck / dueMonitors).
   */
  await db.execute(sql`
    insert into project_monitors (
      project_id, workspace_id, url, enabled, interval_seconds, failure_threshold,
      timeout_ms, status, consecutive_failures, consecutive_successes,
      last_checked_at, last_status_change_at, last_error, created_at, updated_at
    ) values (
      ${projectId},
      ${workspaceId},
      ${target.url},
      ${enabled ? 1 : 0},
      ${intervalSeconds},
      ${failureThreshold},
      ${timeoutMs},
      ${status},
      ${consecutiveFailures},
      ${consecutiveSuccesses},
      ${lastCheckedAt}::timestamptz,
      ${lastStatusChangeAt}::timestamptz,
      ${lastError},
      ${createdAt}::timestamptz,
      ${at}::timestamptz
    )
    on conflict (project_id) do update set
      workspace_id = excluded.workspace_id,
      url = excluded.url,
      enabled = excluded.enabled,
      interval_seconds = excluded.interval_seconds,
      failure_threshold = excluded.failure_threshold,
      timeout_ms = excluded.timeout_ms,
      status = excluded.status,
      consecutive_failures = excluded.consecutive_failures,
      consecutive_successes = excluded.consecutive_successes,
      last_checked_at = excluded.last_checked_at,
      last_status_change_at = excluded.last_status_change_at,
      last_error = excluded.last_error,
      updated_at = excluded.updated_at
  `);

  if (retargeted) {
    await db.delete(projectChecks).where(eq(projectChecks.projectId, projectId));
  }

  const [saved] = await db
    .select()
    .from(projectMonitors)
    .where(eq(projectMonitors.projectId, projectId));
  return toView(saved);
}

export async function deleteMonitor(
  scope: Scope,
  projectId: string
): Promise<{ deleted: boolean }> {
  requireWrite(scope);
  await requireProject(scope, projectId);
  const db = requireDb();

  const removed = await db
    .delete(projectMonitors)
    .where(eq(projectMonitors.projectId, projectId))
    .returning({ projectId: projectMonitors.projectId });

  await db.delete(projectChecks).where(eq(projectChecks.projectId, projectId));
  return { deleted: removed.length > 0 };
}

/**
 * Monitors that are enabled and whose own interval has elapsed.
 *
 * Being due is decided in SQL against each monitor's interval, so calling the
 * cron more often than any monitor needs is harmless — it simply finds nothing
 * to do. That is what lets one endpoint serve every scheduler.
 */
export async function dueMonitors(now: Date = new Date(), limit = 100): Promise<DueMonitor[]> {
  const rows = await requireDb()
    .select({
      projectId: projectMonitors.projectId,
      workspaceId: projectMonitors.workspaceId,
      projectName: projects.name,
      url: projectMonitors.url,
      timeoutMs: projectMonitors.timeoutMs,
      failureThreshold: projectMonitors.failureThreshold,
      status: projectMonitors.status,
      consecutiveFailures: projectMonitors.consecutiveFailures,
      consecutiveSuccesses: projectMonitors.consecutiveSuccesses,
      lastStatusChangeAt: projectMonitors.lastStatusChangeAt,
    })
    .from(projectMonitors)
    .innerJoin(projects, eq(projects.id, projectMonitors.projectId))
    .where(
      and(
        eq(projectMonitors.enabled, 1),
        or(
          isNull(projectMonitors.lastCheckedAt),
          /**
           * The string and the cast are both load-bearing.
           *
           * A raw `Date` cannot be interpolated here: drizzle hands parameters
           * to postgres.js through its `unsafe` path, which serialises nothing
           * and fails on a Date with "the string argument must be of type
           * string". A column comparison would have carried the type mapping
           * that avoids this; a bare fragment has none.
           *
           * The cast then gives Postgres the type it cannot otherwise infer,
           * without which the subtraction resolves no operator.
           */
          lte(
            projectMonitors.lastCheckedAt,
            sql`${now.toISOString()}::timestamptz - make_interval(secs => ${projectMonitors.intervalSeconds})`
          )
        )
      )
    )
    .orderBy(projectMonitors.lastCheckedAt)
    .limit(limit);

  return rows.map((row) => ({ ...row, status: row.status as MonitorStatus }));
}

/**
 * The shortest gap allowed between manual checks of one project.
 *
 * The button asks our server to fetch somebody else's URL on demand, so
 * without this it is a way to make Noxen hammer a third party. Held in the
 * database rather than in memory because there is no single process to hold it.
 */
export const MANUAL_CHECK_COOLDOWN_MS = 15_000;

/**
 * Loads a monitor for an on-demand check, proving the caller may act on it.
 *
 * Mirrors `dueMonitors` in shape so the manual path and the sweep can share
 * everything downstream of "which monitor, and what state is it in".
 */
export async function monitorForCheck(
  scope: Scope,
  projectId: string,
  now: Date = new Date()
): Promise<DueMonitor> {
  requireWrite(scope);
  const project = await requireProject(scope, projectId);

  const [row] = await requireDb()
    .select()
    .from(projectMonitors)
    .where(eq(projectMonitors.projectId, projectId));

  if (!row) {
    throw new ProjectError(404, 'NOT_FOUND', 'This project is not being monitored yet.');
  }

  if (
    row.lastCheckedAt &&
    now.getTime() - row.lastCheckedAt.getTime() < MANUAL_CHECK_COOLDOWN_MS
  ) {
    throw new ProjectError(
      429,
      'TOO_MANY_REQUESTS',
      'Just checked. Give it a few seconds before checking again.'
    );
  }

  return {
    projectId: row.projectId,
    workspaceId: row.workspaceId,
    projectName: project.name,
    url: row.url,
    timeoutMs: row.timeoutMs,
    failureThreshold: row.failureThreshold,
    status: row.status as MonitorStatus,
    consecutiveFailures: row.consecutiveFailures,
    consecutiveSuccesses: row.consecutiveSuccesses,
    lastStatusChangeAt: row.lastStatusChangeAt,
  };
}

/** Writes one probe result and the state it produced. */
export async function recordCheck(
  projectId: string,
  outcome: {
    ok: boolean;
    statusCode: number | null;
    latencyMs: number | null;
    error: string | null;
  },
  transition: Transition,
  now: Date = new Date()
): Promise<void> {
  const db = requireDb();
  /**
   * Timestamps go in as ISO strings. Drizzle's Date mapping for inserts is
   * supposed to serialise them, but on Workers the postgres.js path has
   * already proven it will throw "string argument must be of type string /
   * Received an instance of Date" for the same values in SQL fragments —
   * and a hung/cancelled Worker after that leaves the isolate poisoned.
   * Strings are unambiguous everywhere we have measured.
   */
  const at = now.toISOString();

  await db.execute(sql`
    insert into project_checks (project_id, checked_at, ok, status_code, latency_ms, error)
    values (
      ${projectId},
      ${at}::timestamptz,
      ${outcome.ok ? 1 : 0},
      ${outcome.statusCode},
      ${outcome.latencyMs},
      ${outcome.error}
    )
  `);

  if (transition.alert) {
    await db.execute(sql`
      update project_monitors
         set status = ${transition.status},
             consecutive_failures = ${transition.consecutiveFailures},
             consecutive_successes = ${transition.consecutiveSuccesses},
             last_checked_at = ${at}::timestamptz,
             last_status_change_at = ${at}::timestamptz,
             last_error = ${outcome.ok ? null : outcome.error},
             updated_at = ${at}::timestamptz
       where project_id = ${projectId}
    `);
  } else {
    await db.execute(sql`
      update project_monitors
         set status = ${transition.status},
             consecutive_failures = ${transition.consecutiveFailures},
             consecutive_successes = ${transition.consecutiveSuccesses},
             last_checked_at = ${at}::timestamptz,
             last_error = ${outcome.ok ? null : outcome.error},
             updated_at = ${at}::timestamptz
       where project_id = ${projectId}
    `);
  }
}

/**
 * Who to email about a workspace's monitors: its members, minus anyone who has
 * turned uptime alerts off. A member with no preferences row has never been
 * asked, and is included — they opted in by adding a monitor.
 *
 * A personal workspace has no `workspace_members` row (its id is the owner's
 * user id), so that case is answered without a lookup, matching how membership
 * is resolved everywhere else.
 */
export async function alertRecipients(workspaceId: string): Promise<string[]> {
  const db = requireDb();

  // Membership and opt-out are read together but judged separately: "this
  // workspace has no member rows" (personal) and "every member opted out" are
  // different answers, and collapsing them would mail the workspace id as if it
  // were a user.
  const members = (await db.execute(sql`
    select distinct m.user_id as user_id, coalesce(p.uptime_alerts, 1) as alerts
    from workspace_members m
    left join email_preferences p on p.user_id = m.user_id
    where m.workspace_id = ${workspaceId}
  `)) as unknown as { user_id: string; alerts: number }[];

  if (members.length > 0) {
    return members.filter((row) => Number(row.alerts) === 1).map((row) => row.user_id);
  }

  const owner = (await db.execute(sql`
    select uptime_alerts from email_preferences where user_id = ${workspaceId}
  `)) as unknown as { uptime_alerts: number }[];

  return owner.length === 0 || Number(owner[0].uptime_alerts) === 1 ? [workspaceId] : [];
}

/**
 * Whether the `uptime_alerts` column exists. Separate from
 * `monitorStorageReady` because the two are in different migrations' blast
 * radius: the tables can be present while the column is not.
 */
export async function alertStorageReady(): Promise<boolean> {
  try {
    await requireDb().execute(sql`select uptime_alerts from email_preferences limit 1`);
    return true;
  } catch {
    return false;
  }
}

/** Whether a user currently receives uptime alerts. Defaults to yes. */
export async function getUptimeAlerts(userId: string): Promise<boolean> {
  const rows = (await requireDb().execute(sql`
    select uptime_alerts from email_preferences where user_id = ${userId}
  `)) as unknown as { uptime_alerts: number }[];

  return rows.length === 0 || Number(rows[0].uptime_alerts) === 1;
}

/** Drops check rows past the retention window. Returns how many went. */
export async function pruneChecks(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * DAY_MS);
  /**
   * ISO string, not a Date: same Workers/postgres.js binding trap as
   * dueMonitors. And prefer `rowCount` over `.returning()` — returning every
   * deleted id can materialise a huge array when retention finally bites.
   */
  const result = await requireDb().execute(sql`
    delete from project_checks
     where checked_at < ${cutoff.toISOString()}::timestamptz
  `);
  const count = Number((result as { count?: number }).count ?? 0);
  return count;
}

/** Turns uptime alerts on or off for one user. */
export async function setUptimeAlerts(userId: string, enabled: boolean) {
  await requireDb().execute(sql`
    update email_preferences
       set uptime_alerts = ${enabled ? 1 : 0}, updated_at = now()
     where user_id = ${userId}
  `);
  return { uptimeAlerts: enabled };
}

/** Unsubscribe from alerts by token, for the link in an alert email. */
export async function unsubscribeAlertsByToken(token: string): Promise<boolean> {
  if (!/^[a-f0-9]{48}$/.test(token)) return false;

  const rows = (await requireDb().execute(sql`
    update email_preferences
       set uptime_alerts = 0, updated_at = now()
     where unsubscribe_token = ${token}
    returning user_id
  `)) as unknown as { user_id: string }[];

  return rows.length > 0;
}

/** Half-hour columns over the last day, matching the drawer's strip. */
const STRIP_SLOTS = 48;

export type UptimeRow = {
  projectId: string;
  projectName: string;
  url: string;
  status: MonitorStatus;
  enabled: boolean;
  lastCheckedAt: string | null;
  lastError: string | null;
  intervalSeconds: number;
  windows: { day: UptimeSummary; week: UptimeSummary; month: UptimeSummary };
  /** Oldest first, so the strip reads left to right like a timeline. */
  buckets: Bucket[];
};

export type WorkspaceUptime = {
  monitored: UptimeRow[];
  /** Projects in the workspace with no monitor yet, so the page can offer them. */
  unmonitored: { id: string; name: string; liveUrl: string | null }[];
};

/**
 * Every monitor in the workspace with its history, for the portfolio view.
 *
 * The counting is done in SQL on purpose. At a five-minute interval one
 * project accumulates ~8,600 checks a month, so loading rows to add them up in
 * JavaScript would move tens of megabytes to render one page. Two grouped
 * queries return one row per project instead.
 */
export async function listWorkspaceUptime(
  scope: Scope,
  now: Date = new Date()
): Promise<WorkspaceUptime> {
  const db = requireDb();
  const workspaceId = scope.workspace.workspaceId;

  const monitors = await db
    .select({
      projectId: projectMonitors.projectId,
      projectName: projects.name,
      url: projectMonitors.url,
      status: projectMonitors.status,
      enabled: projectMonitors.enabled,
      lastCheckedAt: projectMonitors.lastCheckedAt,
      lastError: projectMonitors.lastError,
      intervalSeconds: projectMonitors.intervalSeconds,
    })
    .from(projectMonitors)
    .innerJoin(projects, eq(projects.id, projectMonitors.projectId))
    .where(eq(projects.workspaceId, workspaceId))
    .orderBy(projects.name);

  const all = await db
    .select({ id: projects.id, name: projects.name, liveUrl: projects.liveUrl })
    .from(projects)
    .where(eq(projects.workspaceId, workspaceId))
    .orderBy(projects.name);

  const monitoredIds = monitors.map((row) => row.projectId);
  const unmonitored = all
    .filter((project) => !monitoredIds.includes(project.id))
    .map((project) => ({ id: project.id, name: project.name, liveUrl: project.liveUrl }));

  if (monitoredIds.length === 0) return { monitored: [], unmonitored };

  const monthAgo = new Date(now.getTime() - 30 * DAY_MS);
  const dayAgo = new Date(now.getTime() - DAY_MS);
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);

  // Boundaries are passed as cast strings, not Date objects. A bare parameter
  // inside a raw fragment gets none of the column's type mapping, so Postgres
  // is left to infer it — the explicit cast removes the guesswork.
  const monthStart = sql`${monthAgo.toISOString()}::timestamptz`;
  const dayStart = sql`${dayAgo.toISOString()}::timestamptz`;
  const weekStart = sql`${weekAgo.toISOString()}::timestamptz`;
  const inScope = and(
    inArray(projectChecks.projectId, monitoredIds),
    sql`${projectChecks.checkedAt} >= ${monthStart}`
  );

  // The other casts are load-bearing too: count() is bigint and avg() numeric,
  // both of which the driver hands back as strings.
  const totals = await db
    .select({
      projectId: projectChecks.projectId,
      dayChecks: sql<number>`count(*) filter (where ${projectChecks.checkedAt} >= ${dayStart})::int`,
      dayFailures: sql<number>`count(*) filter (where ${projectChecks.checkedAt} >= ${dayStart} and ${projectChecks.ok} = 0)::int`,
      dayLatency: sql<
        number | null
      >`avg(${projectChecks.latencyMs}) filter (where ${projectChecks.checkedAt} >= ${dayStart} and ${projectChecks.ok} = 1)::float`,
      weekChecks: sql<number>`count(*) filter (where ${projectChecks.checkedAt} >= ${weekStart})::int`,
      weekFailures: sql<number>`count(*) filter (where ${projectChecks.checkedAt} >= ${weekStart} and ${projectChecks.ok} = 0)::int`,
      monthChecks: sql<number>`count(*)::int`,
      monthFailures: sql<number>`count(*) filter (where ${projectChecks.ok} = 0)::int`,
    })
    .from(projectChecks)
    .where(inScope)
    .groupBy(projectChecks.projectId);

  /**
   * The strip is built in JavaScript, unlike the windows above.
   *
   * Bucketing in SQL needs the same expression in SELECT and GROUP BY, and
   * Postgres compares those after parsing — two renderings that differ only in
   * parameter position are not the same expression to it. Rather than fight
   * that, this reads one day of rows, which is only a few hundred per project,
   * and reuses `bucketize`, which is already covered by unit tests.
   */
  const dayRows = await db
    .select({
      projectId: projectChecks.projectId,
      checkedAt: projectChecks.checkedAt,
      ok: projectChecks.ok,
    })
    .from(projectChecks)
    .where(
      and(inArray(projectChecks.projectId, monitoredIds), sql`${projectChecks.checkedAt} >= ${dayStart}`)
    );

  const totalsBy = new Map(totals.map((row) => [row.projectId, row]));
  const dayBy = new Map<string, CheckRecord[]>();
  for (const row of dayRows) {
    const forProject = dayBy.get(row.projectId) ?? [];
    forProject.push({ checkedAt: row.checkedAt, ok: row.ok === 1, latencyMs: null });
    dayBy.set(row.projectId, forProject);
  }

  function summaryOf(checks: number, failures: number, latency: number | null): UptimeSummary {
    return {
      checks,
      failures,
      uptimePct: uptimeFromCounts(checks, failures),
      avgLatencyMs: latency === null ? null : Math.round(latency),
    };
  }

  return {
    unmonitored,
    monitored: monitors.map((monitor) => {
      const t = totalsBy.get(monitor.projectId);
      const buckets = bucketize(dayBy.get(monitor.projectId) ?? [], dayAgo, now, STRIP_SLOTS);

      return {
        projectId: monitor.projectId,
        projectName: monitor.projectName,
        url: monitor.url,
        status: monitor.status as MonitorStatus,
        enabled: monitor.enabled === 1,
        lastCheckedAt: monitor.lastCheckedAt?.toISOString() ?? null,
        lastError: monitor.lastError,
        intervalSeconds: monitor.intervalSeconds,
        windows: {
          day: summaryOf(
            Number(t?.dayChecks ?? 0),
            Number(t?.dayFailures ?? 0),
            t?.dayLatency == null ? null : Number(t.dayLatency)
          ),
          week: summaryOf(Number(t?.weekChecks ?? 0), Number(t?.weekFailures ?? 0), null),
          month: summaryOf(Number(t?.monthChecks ?? 0), Number(t?.monthFailures ?? 0), null),
        },
        buckets,
      };
    }),
  };
}

/** Statuses for a set of projects, for the dashboard list. */
export async function monitorStatuses(
  workspaceId: string,
  projectIds: string[]
): Promise<Record<string, { status: MonitorStatus; enabled: boolean }>> {
  if (projectIds.length === 0) return {};

  const rows = await requireDb()
    .select({
      projectId: projectMonitors.projectId,
      status: projectMonitors.status,
      enabled: projectMonitors.enabled,
    })
    .from(projectMonitors)
    .where(
      and(
        eq(projectMonitors.workspaceId, workspaceId),
        inArray(projectMonitors.projectId, projectIds)
      )
    );

  return Object.fromEntries(
    rows.map((row) => [
      row.projectId,
      { status: row.status as MonitorStatus, enabled: row.enabled === 1 },
    ])
  );
}
