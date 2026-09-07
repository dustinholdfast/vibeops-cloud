import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ActivityItem, Project } from '../types';
import { buildPortfolioReview, projectMomentum } from './review';

const now = new Date('2026-09-07T12:00:00-04:00');

/** Days before `now`, as an ISO timestamp. */
function daysAgo(days: number): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function event(type: ActivityItem['type'], days: number): ActivityItem {
  return {
    id: `${type}-${days}`,
    type,
    message: `${type} event`,
    timestamp: daysAgo(days),
  };
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: overrides.id ?? 'project',
    name: overrides.name ?? 'Project',
    nextAction: 'Take the next step',
    stage: 'Building',
    priority: 'Later',
    health: 'On track',
    targetDate: null,
    lastTouched: daysAgo(1),
    createdAt: daysAgo(60),
    progress: 20,
    activity: [],
    ...overrides,
  };
}

describe('project momentum', () => {
  it('calls a project accelerating when it moved more than the window before', () => {
    const momentum = projectMomentum(
      project({ activity: [event('stage', 1), event('action', 2), event('priority', 9)] }),
      now
    );

    assert.equal(momentum.state, 'accelerating');
    assert.equal(momentum.recent, 5);
    assert.equal(momentum.prior, 1);
    assert.equal(momentum.events, 2);
  });

  it('calls a project slowing when the work has thinned out', () => {
    const momentum = projectMomentum(
      project({
        activity: [event('target', 2), event('stage', 8), event('action', 9), event('comment', 10)],
      }),
      now
    );

    assert.equal(momentum.state, 'slowing');
  });

  it('calls a project steady when both windows look alike', () => {
    const momentum = projectMomentum(
      project({ activity: [event('action', 2), event('action', 9)] }),
      now
    );

    assert.equal(momentum.state, 'steady');
  });

  it('treats a window with no scoring events as stalled', () => {
    const momentum = projectMomentum(
      project({ activity: [event('created', 1), event('stage', 30)] }),
      now
    );

    assert.equal(momentum.state, 'stalled');
    assert.equal(momentum.events, 0);
  });

  it('ignores future timestamps and unparseable ones', () => {
    const skewed: ActivityItem = { id: 'skew', type: 'stage', message: 'skew', timestamp: daysAgo(-3) };
    const broken: ActivityItem = { id: 'bad', type: 'stage', message: 'bad', timestamp: 'not a date' };

    const momentum = projectMomentum(project({ activity: [skewed, broken] }), now);

    assert.equal(momentum.state, 'stalled');
    assert.equal(momentum.recent, 0);
  });
});

describe('portfolio review', () => {
  it('separates shipped, advanced and slipped work', () => {
    const review = buildPortfolioReview(
      [
        project({ id: 'shipped', stage: 'Live', activity: [event('stage', 2)] }),
        project({ id: 'advanced', stage: 'Testing', activity: [event('stage', 3)] }),
        project({ id: 'slipped', health: 'Blocked', activity: [event('health', 1)] }),
      ],
      now
    );

    assert.deepEqual(review.shipped.map((p) => p.id), ['shipped']);
    assert.deepEqual(review.advanced.map((p) => p.id), ['advanced']);
    assert.deepEqual(review.slipped.map((p) => p.id), ['slipped']);
  });

  it('reports stalled active work, worst first, and ignores inactive projects', () => {
    const review = buildPortfolioReview(
      [
        project({ id: 'quiet', lastTouched: daysAgo(12), activity: [event('stage', 30)] }),
        project({ id: 'quieter', lastTouched: daysAgo(20), activity: [event('stage', 30)] }),
        project({ id: 'archived', stage: 'Archived', lastTouched: daysAgo(40), activity: [] }),
      ],
      now
    );

    assert.deepEqual(review.stalled.map((s) => s.project.id), ['quieter', 'quiet']);
    assert.deepEqual(review.stalled.map((s) => s.staleDays), [20, 12]);
  });

  it('does not call a project stalled before it has had a full window', () => {
    const review = buildPortfolioReview(
      [project({ id: 'newborn', createdAt: daysAgo(2), lastTouched: daysAgo(2), activity: [event('created', 2)] })],
      now
    );

    assert.deepEqual(review.stalled, []);
  });

  it('builds one chronological timeline across every project, newest first', () => {
    const review = buildPortfolioReview(
      [
        project({ id: 'a', activity: [event('stage', 5), event('comment', 1)] }),
        project({ id: 'b', activity: [event('action', 3), event('priority', 30)] }),
      ],
      now
    );

    assert.deepEqual(
      review.timeline.map((entry) => `${entry.project.id}:${entry.item.type}`),
      ['a:comment', 'b:action', 'a:stage']
    );
  });

  it('counts only active projects and says when nothing moved', () => {
    const review = buildPortfolioReview(
      [
        project({ id: 'active', createdAt: daysAgo(2), lastTouched: daysAgo(2), activity: [] }),
        project({ id: 'live', stage: 'Live', activity: [] }),
      ],
      now
    );

    assert.equal(review.activeCount, 1);
    assert.equal(review.touchedCount, 0);
    assert.equal(review.headline, 'Nothing moved in the last 7 days.');
  });

  it('summarises a mixed week in the headline', () => {
    const review = buildPortfolioReview(
      [
        project({ id: 'shipped', stage: 'Live', activity: [event('stage', 2)] }),
        project({ id: 'slipped', health: 'At risk', activity: [event('health', 1)] }),
      ],
      now
    );

    assert.equal(review.headline, '1 shipped · 1 slipped over 7 days.');
  });
});
