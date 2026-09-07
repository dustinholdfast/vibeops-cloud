import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Project } from '../../types';
import { buildPortfolioReview } from '../review';
import { hasSomethingToSay, renderDigest, type WorkspaceDigest } from './render-digest';

const now = new Date('2026-09-07T12:00:00-04:00');

function daysAgo(days: number): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: overrides.id ?? 'p',
    name: overrides.name ?? 'Project',
    nextAction: 'Ship it',
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

function workspace(projects: Project[], name = 'Personal', personal = true): WorkspaceDigest {
  return {
    workspaceId: personal ? 'user_alice' : 'ws_team',
    name,
    personal,
    review: buildPortfolioReview(projects, now),
  };
}

const stageEvent = (days: number) => ({
  id: `s${days}`,
  type: 'stage' as const,
  message: 'Stage changed',
  timestamp: daysAgo(days),
});

const baseInput = {
  appUrl: 'https://vibeops.example',
  unsubscribeUrl: 'https://vibeops.example/api/email/unsubscribe?token=abc',
};

describe('deciding whether to send', () => {
  it('sends when something shipped, advanced, slipped or stalled', () => {
    assert.equal(
      hasSomethingToSay([workspace([project({ stage: 'Live', activity: [stageEvent(2)] })])]),
      true
    );
    assert.equal(
      hasSomethingToSay([workspace([project({ lastTouched: daysAgo(20), activity: [stageEvent(40)] })])]),
      true
    );
  });

  it('stays quiet when there is nothing to report', () => {
    assert.equal(hasSomethingToSay([]), false);
    assert.equal(
      hasSomethingToSay([workspace([project({ stage: 'Live', activity: [] })])]),
      false
    );
  });
});

describe('the subject line', () => {
  it('leads with shipped work when there is any', () => {
    const email = renderDigest({
      ...baseInput,
      workspaces: [
        workspace([
          project({ id: 'a', stage: 'Live', activity: [stageEvent(2)] }),
          project({ id: 'b', stage: 'Live', activity: [stageEvent(3)] }),
        ]),
      ],
    });
    assert.equal(email.subject, 'You shipped 2 projects last week');
  });

  it('falls back to what slipped, then to what went quiet', () => {
    const slipped = renderDigest({
      ...baseInput,
      workspaces: [
        workspace([
          project({
            health: 'Blocked',
            activity: [{ id: 'h', type: 'health', message: 'Blocked', timestamp: daysAgo(1) }],
          }),
        ]),
      ],
    });
    assert.equal(slipped.subject, '1 project needs attention');

    const quiet = renderDigest({
      ...baseInput,
      workspaces: [workspace([project({ lastTouched: daysAgo(30), activity: [stageEvent(40)] })])],
    });
    assert.equal(quiet.subject, '1 project has gone quiet');
  });
});

describe('the rendered email', () => {
  it('names each project and links the dashboard and unsubscribe', () => {
    const email = renderDigest({
      ...baseInput,
      firstName: 'Dustin',
      workspaces: [workspace([project({ name: 'Harbour', stage: 'Live', activity: [stageEvent(2)] })])],
    });

    assert.ok(email.html.includes('Harbour'));
    assert.ok(email.html.includes('https://vibeops.example/dashboard'));
    assert.ok(email.html.includes(baseInput.unsubscribeUrl));
    assert.ok(email.html.includes('Morning, Dustin.'));

    assert.ok(email.text.includes('Harbour'));
    assert.ok(email.text.includes(baseInput.unsubscribeUrl));
  });

  it('escapes project names so a name cannot inject markup', () => {
    const email = renderDigest({
      ...baseInput,
      workspaces: [
        workspace([
          project({ name: '<img src=x onerror=alert(1)>', stage: 'Live', activity: [stageEvent(2)] }),
        ]),
      ],
    });

    assert.ok(!email.html.includes('<img src=x'), 'raw markup must not reach the message');
    assert.ok(email.html.includes('&lt;img src=x'));
  });

  it('labels each workspace only when there is more than one', () => {
    const single = renderDigest({
      ...baseInput,
      workspaces: [workspace([project({ stage: 'Live', activity: [stageEvent(2)] })])],
    });
    assert.ok(!single.html.includes('Personal'), 'one workspace needs no heading');

    const many = renderDigest({
      ...baseInput,
      workspaces: [
        workspace([project({ id: 'a', stage: 'Live', activity: [stageEvent(2)] })]),
        workspace([project({ id: 'b', stage: 'Live', activity: [stageEvent(2)] })], 'Team', false),
      ],
    });
    assert.ok(many.html.includes('Personal'));
    assert.ok(many.html.includes('Team'));
  });

  it('reports how long stalled work has been untouched', () => {
    const email = renderDigest({
      ...baseInput,
      workspaces: [
        workspace([
          project({ name: 'Dormant', lastTouched: daysAgo(23), activity: [stageEvent(40)] }),
        ]),
      ],
    });

    assert.ok(email.html.includes('Dormant'));
    assert.ok(email.html.includes('23d'));
    assert.ok(email.text.includes('Dormant (23d)'));
  });
});
