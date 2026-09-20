import test from 'node:test';
import assert from 'node:assert/strict';
import { activityFromEventRows, eventsFromActivity } from './activity-events';

test('activityFromEventRows is newest first and capped', () => {
  const rows = Array.from({ length: 52 }, (_, i) => ({
    id: `e${i}`,
    projectId: 'p1',
    workspaceId: 'w1',
    type: 'comment',
    message: `n${i}`,
    author: null,
    createdAt: new Date(2026, 0, 1, 0, i).toISOString(),
  }));
  const activity = activityFromEventRows(rows);
  assert.equal(activity.length, 50);
  assert.equal(activity[0].id, 'e51');
  assert.equal(activity[0].message, 'n51');
});

test('eventsFromActivity round-trips author and timestamp', () => {
  const [row] = eventsFromActivity('p1', 'w1', [
    {
      id: 'a1',
      type: 'created',
      message: 'Project created',
      timestamp: '2026-09-20T12:00:00.000Z',
      author: 'You',
    },
  ]);
  assert.equal(row.projectId, 'p1');
  assert.equal(row.author, 'You');
  assert.equal(row.createdAt.toISOString(), '2026-09-20T12:00:00.000Z');
});
