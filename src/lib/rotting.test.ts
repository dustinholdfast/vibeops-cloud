import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isRotting, quietLabel } from './rotting';
import type { Project } from '../types';

/**
 * Local midnight as an ISO string.
 *
 * `staleDaysFor` counts *calendar* days through `startOfDay`, which is
 * local-time, so fixtures written as UTC instants make the result depend on
 * where the tests run: `2026-09-01T00:00:00Z` is still 31 August anywhere west
 * of UTC, and the gap comes out a day wider. Local days are the right
 * behaviour — "quiet 7d" should mean seven of the reader's days — so the
 * fixtures are built locally rather than the implementation changed.
 */
function localIso(year: number, monthIndex: number, day: number, hour = 0): string {
  return new Date(year, monthIndex, day, hour).toISOString();
}

function project(overrides: Partial<Project>): Project {
  return {
    id: 'p1',
    name: 'Demo',
    nextAction: 'Ship',
    stage: 'Building',
    priority: 'Now',
    health: 'On track',
    targetDate: null,
    lastTouched: localIso(2026, 8, 1),
    createdAt: localIso(2026, 7, 1),
    liveUrl: null,
    repoUrl: null,
    progress: 10,
    activity: [],
    ...overrides,
  };
}

describe('rotting', () => {
  const now = new Date(2026, 8, 8, 12);

  it('marks active work untouched for 7+ days', () => {
    assert.equal(isRotting(project({ lastTouched: localIso(2026, 8, 1) }), now), true);
    assert.equal(quietLabel(project({ lastTouched: localIso(2026, 8, 1) }), now), 'quiet 7d');
  });

  it('leaves work touched within the window alone', () => {
    assert.equal(isRotting(project({ lastTouched: localIso(2026, 8, 2) }), now), false);
    assert.equal(quietLabel(project({ lastTouched: localIso(2026, 8, 2) }), now), 'quiet 6d');
  });

  it('counts calendar days, so the hour of day does not move the count', () => {
    // Both are the same calendar day; a late edit is not a day fresher.
    assert.equal(quietLabel(project({ lastTouched: localIso(2026, 8, 1, 0) }), now), 'quiet 7d');
    assert.equal(quietLabel(project({ lastTouched: localIso(2026, 8, 1, 23) }), now), 'quiet 7d');
  });

  it('ignores Live and Archived', () => {
    assert.equal(
      isRotting(project({ stage: 'Live', lastTouched: localIso(2026, 7, 1) }), now),
      false
    );
    assert.equal(
      isRotting(project({ stage: 'Archived', lastTouched: localIso(2026, 7, 1) }), now),
      false
    );
  });
});
