import type { Project, ActivityItem } from '@/src/types';
import type { DbProject, NewDbProject } from './schema';

export function dbProjectToDomain(row: DbProject): Project {
  return {
    id: row.id,
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
  userId: string,
  p: Project
): NewDbProject {
  const now = new Date();
  return {
    id: p.id,
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
