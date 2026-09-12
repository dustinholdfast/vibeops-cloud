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
  // ISO strings, not Date — Workers/postgres.js rejects Date bindings.
  const now = new Date().toISOString();
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
    lastTouched: p.lastTouched as unknown as Date,
    createdAt: p.createdAt as unknown as Date,
    liveUrl: p.liveUrl ?? null,
    repoUrl: p.repoUrl ?? null,
    progress: p.progress,
    activity: p.activity,
    updatedAt: now as unknown as Date,
  };
}
