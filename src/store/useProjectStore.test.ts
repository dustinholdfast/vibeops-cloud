/**
 * Behavioural tests for the client save model.
 *
 * These drive the real store against a fake server so they assert what the user
 * would experience — what is displayed, what is sent, and what survives a
 * failure — rather than mirroring the implementation. Run with: npm test
 */
import { before, beforeEach, afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Project } from '../types';

// --- Environment shims (the store is browser code) ------------------------

type Call = { method: string; url: string; body: Record<string, unknown> | null };

const memory = new Map<string, string>();
const storage: Storage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => void memory.set(key, String(value)),
  removeItem: (key) => void memory.delete(key),
  clear: () => memory.clear(),
  key: (index) => [...memory.keys()][index] ?? null,
  get length() {
    return memory.size;
  },
};
(globalThis as { sessionStorage?: Storage }).sessionStorage = storage;

let calls: Call[] = [];
let handler: (call: Call) => Promise<Response> | Response;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const call: Call = {
    method: init?.method ?? 'GET',
    url: String(input),
    body: init?.body ? JSON.parse(String(init.body)) : null,
  };
  calls.push(call);
  return handler(call);
}) as typeof fetch;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The store is imported after the shims above are installed.
let store: typeof import('./useProjectStore');
let DRAFT_PREFIX: string;

before(async () => {
  store = await import('./useProjectStore');
  DRAFT_PREFIX = store.DRAFT_PREFIX;
});

/** Long enough for the coalescing window plus the round trip to settle. */
const settle = () => delay(store.SAVE_DEBOUNCE_MS + 120);

const USER = 'user_alice';

function serverProject(overrides: Partial<Project> = {}): Project {
  const now = new Date().toISOString();
  return {
    id: 'p1',
    version: 1,
    name: 'Ship the thing',
    nextAction: 'Write the plan',
    stage: 'Building',
    priority: 'Now',
    health: 'On track',
    targetDate: null,
    progress: 20,
    activity: [],
    createdAt: now,
    lastTouched: now,
    ...overrides,
  };
}

const state = () => store.useProjectStore.getState();
const shown = (id: string) => state().projects.find((p) => p.id === id)!;
const patches = () => calls.filter((c) => c.method === 'PATCH');

/** Loads one project so tests start from a normal, fully-saved workspace. */
async function loadWith(projects: Project[]) {
  handler = () => json(200, { projects });
  await state().loadProjects(USER);
  calls = [];
}

beforeEach(() => {
  memory.clear();
  calls = [];
  handler = () => json(200, { projects: [] });
  state().resetSession();
});

afterEach(() => {
  state().resetSession();
});

describe('creating a project', () => {
  it('keeps the typed name and adds nothing when the create fails', async () => {
    handler = () => {
      throw new Error('offline');
    };
    const ok = await state().addProject({ name: 'My new idea' });

    assert.equal(ok, false);
    assert.equal(state().projects.length, 0, 'a failed create must not appear as a project');
    assert.equal(state().creation?.name, 'My new idea', 'the typed name must survive');
    assert.equal(state().creating, false);
    assert.ok(state().operationError, 'the failure must be reported');
  });

  it('surfaces the plan limit so the upgrade path can be shown', async () => {
    handler = () => json(402, { error: 'Free allows 5 projects.', code: 'PLAN_LIMIT' });
    await state().addProject({ name: 'Sixth project' });

    assert.equal(state().operationCode, 'PLAN_LIMIT');
    assert.equal(state().creation?.name, 'Sixth project');
    assert.equal(state().projects.length, 0);
  });

  it('reuses the same id on retry so a lost response cannot duplicate', async () => {
    handler = () => {
      throw new Error('offline');
    };
    await state().addProject({ name: 'Retried' });
    const firstId = (calls[0].body as { id: string }).id;

    handler = (call) => json(201, { project: serverProject({ id: (call.body as { id: string }).id, name: 'Retried' }) });
    const ok = await state().addProject({ name: 'Retried' });

    assert.equal(ok, true);
    const posts = calls.filter((c) => c.method === 'POST');
    assert.equal(posts.length, 2);
    assert.equal((posts[1].body as { id: string }).id, firstId, 'retry must reuse the id');
    assert.equal(state().projects.length, 1);
    assert.equal(state().creation, null);
  });

  it('mints a new id when the old one is already claimed by another account', async () => {
    handler = () => json(409, { error: 'Identifier in use.', code: 'ID_TAKEN' });
    await state().addProject({ name: 'Collides' });
    const firstId = (calls[0].body as { id: string }).id;
    assert.notEqual(state().creation!.id, firstId, 'the stored creation must get a fresh id');

    handler = (call) => json(201, { project: serverProject({ id: (call.body as { id: string }).id }) });
    await state().addProject({ name: 'Collides' });

    const posts = calls.filter((c) => c.method === 'POST');
    assert.notEqual((posts[1].body as { id: string }).id, firstId, 'a taken id must not be retried');
    assert.equal(state().projects.length, 1);
  });
});

describe('editing a project', () => {
  it('coalesces rapid edits into one request that carries the latest value', async () => {
    await loadWith([serverProject()]);
    handler = (call) =>
      json(200, {
        project: serverProject({ ...(call.body as Partial<Project>), version: 2 }),
      });

    state().setProgress('p1', 30);
    state().setProgress('p1', 60);
    state().setProgress('p1', 90);
    await settle();

    assert.equal(patches().length, 1, 'rapid edits must not send three requests');
    assert.equal((patches()[0].body as { progress: number }).progress, 90);
    assert.equal(shown('p1').progress, 90);
    assert.equal(state().drafts.p1, undefined, 'a confirmed save leaves no draft');
  });

  it('sends an edit made during an in-flight request after the first response', async () => {
    await loadWith([serverProject()]);
    // A stateful fake: each save builds on the previous one, as a real server does.
    let stored = serverProject();
    let releaseFirst: (() => void) | null = null;
    handler = async (call) => {
      const body = call.body as Partial<Project> & { version: number };
      if (!releaseFirst) {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      }
      stored = { ...stored, ...body, version: body.version + 1 };
      return json(200, { project: stored });
    };

    state().setStage('p1', 'Testing');
    await delay(store.SAVE_DEBOUNCE_MS + 50);
    // The first PATCH is open; edit again while it is in flight.
    state().setPriority('p1', 'Later');
    await delay(50);
    assert.equal(patches().length, 1, 'only one request per project may be in flight');

    releaseFirst!();
    await settle();

    assert.equal(patches().length, 2, 'the newer edit must be sent after the response');
    const second = patches()[1].body as { version: number; priority: string; stage?: string };
    assert.equal(second.version, 2, 'the follow-up must build on the saved version');
    assert.equal(second.priority, 'Later');
    assert.equal(shown('p1').stage, 'Testing');
    assert.equal(shown('p1').priority, 'Later');
    assert.equal(state().drafts.p1, undefined);
  });

  it('leaves a failed edit visibly unsaved with the value the user typed', async () => {
    await loadWith([serverProject()]);
    handler = () => {
      throw new Error('offline');
    };
    state().setNextAction('p1', 'Call the client');
    await settle();

    assert.equal(shown('p1').nextAction, 'Call the client', 'the edit must stay on screen');
    assert.equal(state().drafts.p1?.status, 'error');
    assert.ok(state().drafts.p1?.error);
  });

  it('reuses the mutation id on retry so an applied edit cannot be applied twice', async () => {
    await loadWith([serverProject()]);
    handler = () => {
      throw new Error('offline');
    };
    state().setNextAction('p1', 'Call the client');
    await settle();
    const firstMutation = (patches()[0].body as { mutationId: string }).mutationId;
    const firstVersion = (patches()[0].body as { version: number }).version;

    handler = (call) =>
      json(200, { project: serverProject({ ...(call.body as Partial<Project>), version: 2 }) });
    await state().retrySave('p1');

    const retry = patches()[1].body as { mutationId: string; version: number };
    assert.equal(retry.mutationId, firstMutation, 'the retry must reuse the mutation id');
    assert.equal(retry.version, firstVersion);
    assert.equal(state().drafts.p1, undefined);
  });

  it('retries the failed request first, then sends edits made since', async () => {
    await loadWith([serverProject()]);
    handler = () => {
      throw new Error('offline');
    };
    state().setStage('p1', 'Testing');
    await settle();
    // The user keeps working while the first save is still unconfirmed.
    state().setPriority('p1', 'Later');
    assert.equal(patches().length, 1, 'a failed draft must not retry itself');

    let stored = serverProject();
    handler = (call) => {
      const body = call.body as Partial<Project> & { version: number };
      stored = { ...stored, ...body, version: body.version + 1 };
      return json(200, { project: stored });
    };
    await state().retrySave('p1');
    await settle();

    assert.equal(patches().length, 3, 'the retry and the newer edit are separate saves');
    const retry = patches()[1].body as Record<string, unknown>;
    const followUp = patches()[2].body as Record<string, unknown>;
    assert.equal(retry.stage, 'Testing');
    assert.equal(retry.mutationId, (patches()[0].body as { mutationId: string }).mutationId);
    assert.equal(retry.version, 1);
    assert.equal(followUp.priority, 'Later');
    assert.equal(followUp.version, 2, 'the follow-up must use the version the retry produced');
    assert.equal(shown('p1').stage, 'Testing');
    assert.equal(shown('p1').priority, 'Later');
    assert.equal(state().drafts.p1, undefined, 'everything is confirmed saved');
  });

  it('discards a draft by reloading the server version', async () => {
    await loadWith([serverProject({ nextAction: 'Server value' })]);
    handler = () => {
      throw new Error('offline');
    };
    state().setNextAction('p1', 'Local value');
    await settle();
    assert.equal(shown('p1').nextAction, 'Local value');

    handler = () => json(200, { project: serverProject({ nextAction: 'Server value', version: 4 }) });
    await state().discardSave('p1');

    assert.equal(shown('p1').nextAction, 'Server value');
    assert.equal(shown('p1').version, 4);
    assert.equal(state().drafts.p1, undefined);
  });
});

describe('conflicts', () => {
  it('replays only the user’s fields onto the version the server now has', async () => {
    await loadWith([serverProject({ name: 'Original', nextAction: 'Original action' })]);
    handler = () => json(409, { error: 'Changed elsewhere.', code: 'CONFLICT' });
    state().setNextAction('p1', 'My action');
    await settle();
    assert.equal(state().drafts.p1?.status, 'conflict');

    // Reviewing fetches the newer server row so the user can compare.
    const latest = serverProject({ name: 'Renamed elsewhere', nextAction: 'Their action', version: 7 });
    handler = () => json(200, { project: latest });
    await state().reviewConflict('p1');
    assert.equal(state().drafts.p1?.latest?.name, 'Renamed elsewhere');

    handler = (call) =>
      json(200, { project: { ...latest, ...(call.body as Partial<Project>), version: 8 } });
    await state().retrySave('p1', true);

    const replay = patches()[1].body as Record<string, unknown>;
    assert.equal(replay.version, 7, 'the replay must target the newer version');
    assert.equal(replay.nextAction, 'My action', 'the user’s edit must be kept');
    assert.equal(replay.name, undefined, 'a field the user never touched must not be overwritten');
    assert.notEqual(
      replay.mutationId,
      (patches()[0].body as { mutationId: string }).mutationId,
      'rebasing is a new mutation'
    );
    assert.equal(shown('p1').name, 'Renamed elsewhere');
    assert.equal(shown('p1').nextAction, 'My action');
    assert.equal(state().drafts.p1, undefined);
  });
});

describe('recovery across a reload', () => {
  it('restores an unsaved draft for the same account and tab', async () => {
    await loadWith([serverProject({ nextAction: 'Server value' })]);
    handler = () => {
      throw new Error('offline');
    };
    state().setNextAction('p1', 'Unsaved value');
    await settle();
    assert.ok(memory.get(DRAFT_PREFIX + USER), 'the draft must be written to storage');

    // A reload: memory is gone, storage is not.
    state().resetSession();
    handler = () => json(200, { projects: [serverProject({ nextAction: 'Server value' })] });
    await state().loadProjects(USER);

    assert.equal(shown('p1').nextAction, 'Unsaved value');
    assert.equal(state().drafts.p1?.status, 'recovered');
    assert.ok(state().drafts.p1?.error, 'the user must be told these are unconfirmed');
  });

  it('restores a failed create so the name is not lost', async () => {
    await loadWith([]);
    handler = () => {
      throw new Error('offline');
    };
    await state().addProject({ name: 'Lost on reload' });

    state().resetSession();
    handler = () => json(200, { projects: [] });
    await state().loadProjects(USER);

    assert.equal(state().creation?.name, 'Lost on reload');
  });

  it('ignores stored drafts that are not valid project data', async () => {
    const tampered = {
      drafts: {
        p1: {
          base: { id: 'p1', name: 'Injected', stage: 'NotAStage', version: 1 },
          patch: { progress: 5 },
          status: 'error',
        },
        p2: { base: serverProject({ id: 'p2' }), patch: { progress: 900 }, status: 'error' },
        p3: 'not an object',
      },
      creation: { id: 'bad id with spaces', name: 'Nope' },
    };
    memory.set(DRAFT_PREFIX + USER, JSON.stringify(tampered));

    handler = () => json(200, { projects: [serverProject()] });
    await state().loadProjects(USER);

    assert.deepEqual(state().drafts, {}, 'malformed drafts must be dropped, not merged');
    assert.equal(state().creation, null, 'an invalid stored creation must be dropped');
    assert.equal(state().projects.length, 1);
    assert.equal(shown('p1').name, 'Ship the thing', 'server data must win over storage');
  });

  it('clears drafts on sign-out and does not carry them to another account', async () => {
    await loadWith([serverProject()]);
    handler = () => {
      throw new Error('offline');
    };
    state().setProgress('p1', 55);
    await settle();
    assert.ok(state().drafts.p1);

    state().resetSession();
    assert.deepEqual(state().drafts, {}, 'sign-out must clear in-memory drafts');
    assert.equal(state().projects.length, 0);

    // Another account signing in on the same tab must not see them.
    handler = () => json(200, { projects: [] });
    await state().loadProjects('user_bob');
    assert.deepEqual(state().drafts, {});
    assert.equal(state().projects.length, 0);
  });
});

describe('workspace operations', () => {
  it('leaves current data intact when an import fails', async () => {
    await loadWith([serverProject()]);
    handler = () => json(402, { error: 'Too many projects.', code: 'PLAN_LIMIT' });

    await state().importProjects([serverProject({ id: 'imported', name: 'Imported' })]);

    assert.equal(state().projects.length, 1);
    assert.equal(shown('p1').name, 'Ship the thing');
    assert.equal(state().operationCode, 'PLAN_LIMIT');
    assert.equal(state().operationBusy, false);
  });

  it('leaves the project in place when a delete fails', async () => {
    await loadWith([serverProject()]);
    handler = () => json(503, { error: 'Unavailable.', code: 'SERVICE_UNAVAILABLE' });

    await state().deleteProject('p1');

    assert.equal(state().projects.length, 1, 'a failed delete must not remove the row');
    assert.ok(state().operationError);
    assert.equal(state().operationBusy, false);
  });

  it('sends the current version when deleting', async () => {
    await loadWith([serverProject({ version: 6 })]);
    handler = () => json(200, { ok: true });

    await state().deleteProject('p1');

    const remove = calls.find((c) => c.method === 'DELETE')!;
    assert.equal((remove.body as { version: number }).version, 6);
    assert.equal(state().projects.length, 0);
  });

  it('blocks import and clear while a project has unsaved changes', async () => {
    await loadWith([serverProject()]);
    handler = () => {
      throw new Error('offline');
    };
    state().setProgress('p1', 42);
    await settle();
    calls = [];

    await state().importProjects([serverProject({ id: 'other' })]);
    assert.equal(calls.filter((c) => c.method === 'PUT').length, 0, 'import must not be sent');
    assert.ok(state().operationError);

    await state().clearAllProjects();
    assert.equal(calls.filter((c) => c.method === 'PUT').length, 0, 'clear must not be sent');
    assert.equal(state().projects.length, 1);
  });

  it('replaces the workspace only after the server confirms the import', async () => {
    await loadWith([serverProject({ version: 3 })]);
    const imported = serverProject({ id: 'imported', name: 'Imported', version: 1 });
    handler = () => json(200, { projects: [imported] });

    await state().importProjects([imported]);

    const put = calls.find((c) => c.method === 'PUT')!;
    assert.deepEqual((put.body as { versions: Record<string, number> }).versions, { p1: 3 });
    assert.equal(state().projects.length, 1);
    assert.equal(shown('imported').name, 'Imported');
  });
});

describe('session expiry', () => {
  it('reports an expired session without discarding the draft', async () => {
    await loadWith([serverProject()]);
    handler = () => json(401, { error: 'Unauthorized', code: 'UNAUTHORIZED' });
    state().setProgress('p1', 77);
    await settle();

    assert.equal(state().drafts.p1?.status, 'error');
    assert.equal(shown('p1').progress, 77, 'the edit must stay on screen');
    assert.match(state().drafts.p1!.error!, /sign in again/i);
  });
});
