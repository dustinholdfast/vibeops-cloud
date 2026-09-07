import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Project } from '../types';
import { rankPortfolio } from './portfolio';

const now = new Date('2026-09-07T12:00:00-04:00');

function project(overrides: Partial<Project>): Project {
  return {
    id: overrides.id ?? 'project',
    name: overrides.name ?? 'Project',
    nextAction: 'Take the next step',
    stage: 'Building',
    priority: 'Later',
    health: 'On track',
    targetDate: null,
    lastTouched: '2026-09-07T10:00:00-04:00',
    createdAt: '2026-09-01T10:00:00-04:00',
    progress: 20,
    activity: [],
    ...overrides,
  };
}

describe('portfolio ranking', () => {
  it('puts blocked and overdue work ahead of an ordinary Now project', () => {
    const ranked = rankPortfolio(
      [
        project({ id: 'focus', priority: 'Now' }),
        project({ id: 'risk', health: 'Blocked', targetDate: '2026-09-06' }),
      ],
      now
    );

    assert.equal(ranked[0].project.id, 'risk');
    assert.deepEqual(ranked[0].reasons.slice(0, 2), ['Blocked', 'Overdue']);
  });

  it('does not recommend inactive projects', () => {
    const ranked = rankPortfolio(
      [
        project({ id: 'live', stage: 'Live', health: 'Blocked' }),
        project({ id: 'paused', stage: 'Paused', priority: 'Now' }),
        project({ id: 'active' }),
      ],
      now
    );

    assert.deepEqual(ranked.map((item) => item.project.id), ['active']);
  });

  it('surfaces stale work and reports how long it has been untouched', () => {
    const [ranked] = rankPortfolio(
      [project({ lastTouched: '2026-08-27T10:00:00-04:00' })],
      now
    );

    assert.equal(ranked.staleDays, 11);
    assert.ok(ranked.reasons.includes('Untouched 11 days'));
  });
});

