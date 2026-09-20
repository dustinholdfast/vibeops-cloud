import { desc, eq, inArray, sql } from 'drizzle-orm';
import { isMissingRelationError, withDb } from './index';
import { projectEvents, type DbProjectEvent } from './schema';
import type { Transaction } from './project-transaction';
import { activityFromEventRows, eventsFromActivity } from '../lib/activity-events';
import type { ActivityItem, Project } from '../types';

export async function eventsTablePresent(tx: Transaction): Promise<boolean> {
  const present = await tx.execute(
    sql`select to_regclass('public.project_events') is not null as present`
  );
  return Boolean((present as unknown as { present: boolean }[])[0]?.present);
}

export async function eventsStorageReady(): Promise<boolean> {
  try {
    await withDb((db) => db.execute(sql`select 1 from project_events limit 1`));
    return true;
  } catch (error) {
    if (isMissingRelationError(error)) return false;
    throw error;
  }
}

export function activityFromDbEvents(rows: DbProjectEvent[]): ActivityItem[] {
  return activityFromEventRows(
    rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      workspaceId: row.workspaceId,
      type: row.type,
      message: row.message,
      author: row.author,
      createdAt: row.createdAt,
    }))
  );
}

export async function insertProjectEvents(
  tx: Transaction,
  projectId: string,
  workspaceId: string,
  items: ActivityItem[] | undefined
) {
  const rows = eventsFromActivity(projectId, workspaceId, items);
  if (!rows.length) return;
  if (!(await eventsTablePresent(tx))) return;
  await tx.insert(projectEvents).values(rows).onConflictDoNothing();
}

export async function dropEventsFor(tx: Transaction, projectIds: string[]) {
  if (!projectIds.length) return;
  if (!(await eventsTablePresent(tx))) return;
  await tx.delete(projectEvents).where(inArray(projectEvents.projectId, projectIds));
}

export async function attachActivities(projects: Project[]): Promise<Project[]> {
  if (!projects.length) return projects;
  if (!(await eventsStorageReady())) return projects;

  const ids = projects.map((project) => project.id);
  const rows = await withDb((db) =>
    db
      .select()
      .from(projectEvents)
      .where(inArray(projectEvents.projectId, ids))
      .orderBy(desc(projectEvents.createdAt))
  );

  const byProject = new Map<string, DbProjectEvent[]>();
  for (const row of rows) {
    const list = byProject.get(row.projectId) ?? [];
    list.push(row);
    byProject.set(row.projectId, list);
  }

  return projects.map((project) => {
    const events = byProject.get(project.id);
    if (!events?.length) return project;
    return { ...project, activity: activityFromDbEvents(events) };
  });
}

export async function attachActivity(project: Project): Promise<Project> {
  const [next] = await attachActivities([project]);
  return next;
}
