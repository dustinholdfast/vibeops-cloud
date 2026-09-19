import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { projects } from './schema';
import {
  dbProjectToDomain,
  domainToDbInsert,
  optionalTimestampToIso,
  timestampToDate,
  timestampToIso,
  timestampToMs,
} from './map';
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

  it('accepts timestamp strings from postgres.js with fetch_types: false', () => {
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
      lastTouched: NOW as unknown as Date,
      createdAt: '2026-09-16 01:44:56.000+00' as unknown as Date,
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

describe('timestampToIso', () => {
  it('passes Date objects through and parses postgres text timestamps', () => {
    assert.equal(timestampToIso(new Date(NOW)), NOW);
    assert.equal(timestampToIso(NOW), NOW);
    assert.equal(timestampToIso('2026-09-16 01:44:56.000+00'), NOW);
    assert.equal(timestampToIso('2026-09-16 01:44:56.000+00:00'), NOW);
    assert.equal(timestampToIso('2026-09-16 01:44:56.000+0000'), NOW);
  });

  it('throws on empty or unusable values', () => {
    assert.throws(() => timestampToIso(''), /Unusable timestamp/);
    assert.throws(() => (NOW as unknown as { toISOString: () => string }).toISOString(), /toISOString is not a function/);
  });
});

describe('timestampToDate / timestampToMs', () => {
  it('turns postgres text into a usable Date so monitor code can compare it', () => {
    const parsed = timestampToDate('2026-09-16 01:44:56.000+00');
    assert.equal(parsed instanceof Date, true);
    assert.equal(parsed.toISOString(), NOW);
    assert.equal(timestampToMs('2026-09-16 01:44:56.000+00'), Date.parse(NOW));
    assert.equal(timestampToMs(new Date(NOW)), Date.parse(NOW));
  });

  it('leaves nullish monitor timestamps as null rather than throwing', () => {
    assert.equal(optionalTimestampToIso(null), null);
    assert.equal(optionalTimestampToIso(undefined), null);
    assert.equal(optionalTimestampToIso('2026-09-16 01:44:56.000+00'), NOW);
  });
});
