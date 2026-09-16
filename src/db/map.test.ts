import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { projects } from './schema';
import { dbProjectToDomain, domainToDbInsert } from './map';
import type { DbProject } from './schema';
import type { Project } from '../types';

const NOW = '2026-09-16T01:44:56.000Z';

function domain(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj_1',
    version: 1,
    name: 'Noxen',
    nextAction: 'Ship the save',
    stage: 'Building',
    priority: 'Now',
    health: 'On track',
    targetDate: null,
    lastTouched: NOW,
    createdAt: NOW,
    progress: 0,
    activity: [],
    ...overrides,
  };
}

describe('domainToDbInsert', () => {
  it('gives drizzle timestamp columns Date objects, not ISO strings', () => {
    const row = domainToDbInsert('ws_1', 'user_1', domain());

    // Drizzle's PgTimestamp mapper calls value.toISOString(). A string throws
    // "toISOString is not a function", which /api/projects reports as 503.
    assert.equal(row.lastTouched instanceof Date, true);
    assert.equal(row.createdAt instanceof Date, true);
    assert.equal(row.updatedAt instanceof Date, true);
    assert.equal(projects.lastTouched.mapToDriverValue(row.lastTouched), NOW);
    assert.equal(projects.createdAt.mapToDriverValue(row.createdAt), NOW);
    assert.doesNotThrow(() => projects.updatedAt.mapToDriverValue(row.updatedAt));
  });

  it('rejects the ISO-string binding that 8f5c5fb shipped', () => {
    assert.throws(
      () => projects.lastTouched.mapToDriverValue(NOW as unknown as Date),
      /toISOString is not a function/
    );
  });
});

describe('dbProjectToDomain', () => {
  it('serialises drizzle Date timestamps to ISO strings', () => {
    const row = {
      id: 'proj_1',
      version: 1,
      lastMutationId: null,
      workspaceId: 'ws_1',
      userId: 'user_1',
      name: 'Noxen',
      nextAction: 'Ship the save',
      stage: 'Building',
      priority: 'Now',
      health: 'On track',
      targetDate: null,
      lastTouched: new Date(NOW),
      createdAt: new Date(NOW),
      liveUrl: null,
      repoUrl: null,
      progress: 0,
      activity: [],
      updatedAt: new Date(NOW),
    } satisfies DbProject;

    const project = dbProjectToDomain(row);
    assert.equal(project.lastTouched, NOW);
    assert.equal(project.createdAt, NOW);
  });
});
