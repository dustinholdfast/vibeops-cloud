import type { Project, ActivityItem } from '@/src/types';
import type { DbProject, NewDbProject } from './schema';

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
    lastTouched: row.lastTouched.toISOString(),
    createdAt: row.createdAt.toISOString(),
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
