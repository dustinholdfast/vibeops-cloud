import { MAX_ACTIVITY_ENTRIES } from './project-validation';
import type { ActivityItem } from '../types';

export type EventRow = {
  id: string;
  projectId: string;
  workspaceId: string;
  type: string;
  message: string;
  author: string | null;
  createdAt: Date | string;
};

export function activityFromEventRows(rows: EventRow[]): ActivityItem[] {
  return [...rows]
    .sort((a, b) => {
      const aMs = new Date(a.createdAt).getTime();
      const bMs = new Date(b.createdAt).getTime();
      return bMs - aMs;
    })
    .slice(0, MAX_ACTIVITY_ENTRIES)
    .map((row) => ({
      id: row.id,
      type: row.type as ActivityItem['type'],
      message: row.message,
      timestamp: new Date(row.createdAt).toISOString(),
      ...(row.author ? { author: row.author } : {}),
    }));
}

export function eventsFromActivity(
  projectId: string,
  workspaceId: string,
  items: ActivityItem[] | undefined
): Array<Omit<EventRow, 'createdAt'> & { createdAt: Date }> {
  if (!items?.length) return [];
  return items.map((item) => ({
    id: item.id,
    projectId,
    workspaceId,
    type: item.type,
    message: item.message,
    author: item.author ?? null,
    createdAt: new Date(item.timestamp),
  }));
}
