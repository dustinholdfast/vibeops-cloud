import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { activitySeries } from './activity-sparkline';
import type { Project } from '../types';

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'One',
    nextAction: 'Do it',
    stage: 'Building',
    priority: 'Now',
    health: 'On track',
    targetDate: null,
    progress: 10,
    activity: [],
    createdAt: '2026-09-01T12:00:00.000Z',
    lastTouched: '2026-09-20T12:00:00.000Z',
    ...overrides,
  };
}

describe('activitySeries', () => {
  it('bins activity timestamps and lastTouched into 14 local days', () => {
    const now = new Date('2026-09-20T15:00:00');
    const series = activitySeries(
      [
        project({
          lastTouched: '2026-09-20T12:00:00',
          activity: [
            {
              id: 'a1',
              type: 'comment',
              message: 'note',
              timestamp: '2026-09-19T12:00:00',
            },
            {
              id: 'a2',
              type: 'touched',
              message: 'Touched',
              timestamp: '2026-09-20T08:00:00',
            },
          ],
        }),
      ],
      14,
      now
    );
    assert.equal(series.length, 14);
    assert.equal(series[12], 1, 'yesterday comment');
    assert.ok(series[13] >= 2, 'today activity + lastTouched');
    assert.equal(series.slice(0, 12).every((n) => n === 0), true);
  });
});
