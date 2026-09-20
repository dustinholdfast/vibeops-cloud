import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Project } from '../types';
import {
  compactProject,
  compactWorkspace,
  copilotClientError,
  copilotSystemPrompt,
  describePatch,
  matchProject,
} from './copilot';

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'alpha',
    name: 'Holdfast CRM',
    nextAction: 'Ship invites',
    stage: 'Building',
    priority: 'Now',
    health: 'On track',
    targetDate: '2026-10-01',
    lastTouched: '2026-09-20T12:00:00.000Z',
    createdAt: '2026-09-01T12:00:00.000Z',
    liveUrl: null,
    repoUrl: 'https://github.com/dustinholdfast/holdfast-crm',
    progress: 40,
    activity: [{ id: 'a1', type: 'created', message: 'created', timestamp: '2026-09-01T12:00:00.000Z' }],
    version: 3,
    ...overrides,
  };
}

describe('copilot snapshot', () => {
  it('drops activity and keeps the fields the model should edit', () => {
    const compact = compactProject(project());
    assert.equal(compact.name, 'Holdfast CRM');
    assert.equal(compact.repoUrl, 'https://github.com/dustinholdfast/holdfast-crm');
    assert.equal('activity' in compact, false);
    assert.equal('version' in compact, false);
  });

  it('caps the workspace snapshot', () => {
    const many = Array.from({ length: 60 }, (_, i) => project({ id: `p${i}`, name: `P${i}` }));
    assert.equal(compactWorkspace(many).length, 50);
  });

  it('matches a project by id or unique name', () => {
    const list = [project(), project({ id: 'beta', name: 'Uptime' })];
    assert.equal(matchProject(list, 'beta')?.name, 'Uptime');
    assert.equal(matchProject(list, undefined, 'holdfast crm')?.id, 'alpha');
    assert.equal(matchProject(list, undefined, 'missing'), undefined);
  });

  it('describes a patch in plain language', () => {
    assert.equal(describePatch({ stage: 'Live', progress: 100 }), 'stage Live, progress 100%');
  });

  it('grounds the system prompt in the snapshot JSON', () => {
    const prompt = copilotSystemPrompt('Personal', compactWorkspace([project()]));
    assert.match(prompt, /Noxen Cloud copilot/);
    assert.match(prompt, /Holdfast CRM/);
    assert.doesNotMatch(prompt, /a1/);
  });

  it('redacts bearer tokens and maps auth failures', () => {
    assert.match(
      copilotClientError(new Error('Unauthorized Bearer sk-secret-token')),
      /rejected the API key/
    );
    assert.doesNotMatch(copilotClientError(new Error('Bearer sk-secret-token failed')), /sk-secret/);
  });
});
