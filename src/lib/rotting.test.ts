import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isRotting, quietLabel } from './rotting';
import type { Project } from '../types';

function project(overrides: Partial<Project>): Project {
  return {
    id: 'p1',
    name: 'Demo',
    nextAction: 'Ship',
    stage: 'Building',
    priority: 'Now',
    health: 'On track',
    targetDate: null,
    lastTouched: '2026-09-01T00:00:00.000Z',
    createdAt: '2026-08-01T00:00:00.000Z',
    liveUrl: null,
    repoUrl: null,
    progress: 10,
    activity: [],
    ...overrides,
  };
}

describe('rotting', () => {
  const now = new Date('2026-09-08T12:00:00.000Z');

  it('marks active work untouched for 7+ days', () => {
    assert.equal(isRotting(project({ lastTouched: '2026-09-01T00:00:00.000Z' }), now), true);
    assert.equal(quietLabel(project({ lastTouched: '2026-09-01T00:00:00.000Z' }), now), 'quiet 7d');
  });

  it('ignores Live and Archived', () => {
    assert.equal(isRotting(project({ stage: 'Live', lastTouched: '2026-08-01T00:00:00.000Z' }), now), false);
    assert.equal(isRotting(project({ stage: 'Archived', lastTouched: '2026-08-01T00:00:00.000Z' }), now), false);
  });
});
