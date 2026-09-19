import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { projects } from './schema';
import {
  dbProjectToDomain,
  domainToDbInsert,
  optionalTimestampToIso,
  safeTimestampToIso,
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
  it('binds timestamps as Dates that the column turns into ISO before postgres.js', () => {
    const row = domainToDbInsert('ws_1', 'user_1', domain());

    assert.equal(row.lastTouched instanceof Date, true);
    assert.equal(row.createdAt instanceof Date, true);
    assert.equal(row.updatedAt instanceof Date, true);
    assert.equal(projects.lastTouched.mapToDriverValue(row.lastTouched), NOW);
    assert.equal(projects.createdAt.mapToDriverValue(row.createdAt), NOW);
    assert.doesNotThrow(() => projects.updatedAt.mapToDriverValue(row.updatedAt));
  });

  it('also accepts an ISO string so Workers never see a Date instance', () => {
    assert.equal(projects.lastTouched.mapToDriverValue(NOW as unknown as Date), NOW);
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

  it('still serialises when drizzle has already turned postgres text into Invalid Date', () => {
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
      lastTouched: new Date('not a date'),
      createdAt: new Date(NOW),
      liveUrl: null,
      repoUrl: null,
      progress: 0,
      activity: [],
      updatedAt: new Date(NOW),
    } satisfies DbProject;

    const project = dbProjectToDomain(row);
    assert.equal(project.createdAt, NOW);
    assert.equal(typeof project.lastTouched, 'string');
    assert.equal(Number.isNaN(Date.parse(project.lastTouched)), false);
  });

  it('list-serialises a row after drizzle mapFromDriverValue on string timestamptz', () => {
    /**
     * This is the /api/projects path: postgres.js fetch_types:false → drizzle
     * mapFromDriverValue → dbProjectToDomain. The stock Date-mode mapper is
     * `new Date(raw)` and turns `T` + `+00` into Invalid Date; our column
     * normalises first so list never 503s on that format.
     */
    const lastTouched = projects.lastTouched.mapFromDriverValue(
      '2026-09-16 01:44:56.000+00'
    ) as Date;
    const createdAt = projects.createdAt.mapFromDriverValue(
      '2026-09-16T01:44:56.000+00'
    ) as Date;
    const updatedAt = projects.updatedAt.mapFromDriverValue(
      '2026-09-16 01:44:56.000+00:00'
    ) as Date;

    const project = dbProjectToDomain({
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
      lastTouched,
      createdAt,
      liveUrl: null,
      repoUrl: null,
      progress: 0,
      activity: [],
      updatedAt,
    } satisfies DbProject);

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
    assert.equal(timestampToIso('2026-09-16T01:44:56.000+00'), NOW);
  });

  it('throws on empty or unusable values', () => {
    assert.throws(() => timestampToIso(''), /Unusable timestamp/);
    assert.throws(() => (NOW as unknown as { toISOString: () => string }).toISOString(), /toISOString is not a function/);
  });

  it('is the Invalid Date drizzle Date-mode produces for T+00 postgres text', () => {
    // Same as PgTimestamp.mapFromDriverValue: new Date(raw), no normalisation.
    const drizzleStyle = new Date('2026-09-16T01:44:56.000+00');
    assert.equal(Number.isNaN(drizzleStyle.getTime()), true);
    assert.throws(() => timestampToIso(drizzleStyle), /Invalid Date timestamp/);
    assert.equal(timestampToIso('2026-09-16T01:44:56.000+00'), NOW);
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

  it('accepts unix-ms numbers from some postgres.js parsers', () => {
    assert.equal(timestampToIso(Date.parse(NOW)), NOW);
  });
});

describe('safeTimestampToIso', () => {
  it('does not throw on Invalid Date or empty text so listProjects can still serialise', () => {
    const fallback = '2026-01-01T00:00:00.000Z';
    assert.equal(safeTimestampToIso(new Date(Number.NaN), fallback), fallback);
    assert.equal(safeTimestampToIso('', fallback), fallback);
    assert.equal(safeTimestampToIso(undefined, fallback), fallback);
    assert.equal(safeTimestampToIso('2026-09-16 01:44:56.000+00', fallback), NOW);
  });
});
