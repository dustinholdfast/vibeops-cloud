import type { Project, ActivityItem } from '@/src/types';
import type { DbProject, NewDbProject } from './schema';

/**
 * Drizzle types these as `Date`, but postgres.js on Workers runs with
 * `fetch_types: false`, so the driver may hand back a timestamp string.
 * Calling `.toISOString()` on a string throws, and `/api/projects` reports
 * that as a generic 503 — empty lists still "load" (zero rows to map).
 *
 * Postgres text (`2026-09-16 01:44:56.000+00`) is also not a valid Date
 * input until the space is a `T` and `+00` is `+00:00`.
 */
export function timestampToIso(value: Date | string): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new TypeError('Invalid Date timestamp');
    }
    return value.toISOString();
  }
  if (typeof value === 'string' && value.length > 0) {
    const parsed = new Date(normaliseTimestamp(value));
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  throw new TypeError(`Unusable timestamp: ${String(value)}`);
}

function normaliseTimestamp(value: string): string {
  let normalised = value.includes('T') ? value : value.replace(' ', 'T');
  // ±HHMM then ±HH — postgres omits the colon that Date requires.
  normalised = normalised.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  normalised = normalised.replace(/([+-]\d{2})$/, '$1:00');
  return normalised;
}

export function dbProjectToDomain(row: DbProject): Project {
  return {
    id: row.id,
    version: row.version,
    name: row.name,
    nextAction: row.nextAction,
    stage: row.stage as Project['stage'],
    priority: row.priority as Project['priority'],
    health: row.health as Project['health'],
    targetDate: row.targetDate,
    lastTouched: timestampToIso(row.lastTouched),
    createdAt: timestampToIso(row.createdAt),
    liveUrl: row.liveUrl ?? undefined,
    repoUrl: row.repoUrl ?? undefined,
    progress: row.progress,
    activity: (row.activity as ActivityItem[]) ?? [],
  };
}

export function domainToDbInsert(
  workspaceId: string,
  userId: string,
  p: Project
): NewDbProject {
  /**
   * Drizzle timestamp columns, not raw SQL.
   *
   * PgTimestamp.mapToDriverValue calls `value.toISOString()`. Real Date
   * objects survive that and become ISO strings *before* postgres.js sees
   * them, which is what avoids the Workers "Received an instance of Date"
   * poison. Passing an ISO string here throws `toISOString is not a function`
   * and /api/projects reports it as a generic 503.
   *
   * Raw `sql` fragments are the opposite: interpolate ISO strings and cast
   * `::timestamptz`. See `src/db/monitor-service.ts`.
   */
  const now = new Date();
  return {
    id: p.id,
    workspaceId,
    userId,
    name: p.name,
    nextAction: p.nextAction,
    stage: p.stage,
    priority: p.priority,
    health: p.health,
    targetDate: p.targetDate,
    lastTouched: new Date(p.lastTouched),
    createdAt: new Date(p.createdAt),
    liveUrl: p.liveUrl ?? null,
    repoUrl: p.repoUrl ?? null,
    progress: p.progress,
    activity: p.activity,
    updatedAt: now,
  };
}
