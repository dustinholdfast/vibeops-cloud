'use client';

import { create } from 'zustand';
import type {
  Project,
  Stage,
  Priority,
  Health,
  FilterStage,
  FilterHealth,
  FilterDeadline,
  ActivityItem,
} from '../types';
import { generateId } from '../lib/utils';
import {
  ApiError,
  apiListProjects,
  apiCreateProject,
  apiUpdateProject,
  apiDeleteProject,
  apiImportProjects,
  apiGetProject,
} from '../lib/api';
import { isRecord } from '../lib/validation';
import {
  MAX_ACTIVITY_ENTRIES,
  validateFields,
  validateId,
  validateImport,
} from '../lib/project-validation';

export const MAX_NOW_SLOTS = 3;
export const DRAFT_PREFIX = 'vibeops-drafts:';
/** Coalescing window: rapid edits to one project become a single request. */
export const SAVE_DEBOUNCE_MS = 300;

type Patch = Partial<Project>;
type SaveRequest = { patch: Patch; version: number; mutationId: string };

/**
 * A draft is the difference between what the server has confirmed (`base`) and
 * what the user sees. `request` is the payload currently in flight (or awaiting
 * an explicit retry); `patch` holds edits made since that request was sent. A
 * project has a draft only while something is unconfirmed, so "no draft" is the
 * only state that may be displayed as saved.
 */
export type Draft = {
  base: Project;
  patch: Patch;
  request?: SaveRequest;
  status: 'saving' | 'error' | 'conflict' | 'recovered';
  error?: string;
  latest?: Project;
};

type Creation = { id: string; name: string };

interface ProjectState {
  userId: string | null;
  projects: Project[];
  drafts: Record<string, Draft>;
  creation: Creation | null;
  creating: boolean;
  operationBusy: boolean;
  operationError: string | null;
  operationCode: string | null;
  filter: FilterStage;
  healthFilter: FilterHealth;
  deadlineFilter: FilterDeadline;
  selectedId: string | null;
  search: string;
  isDrawerOpen: boolean;
  loadStatus: 'idle' | 'loading' | 'ready' | 'error';
  loadError: string | null;
  setFilter: (f: FilterStage) => void;
  setHealthFilter: (f: FilterHealth) => void;
  setDeadlineFilter: (f: FilterDeadline) => void;
  setSearch: (s: string) => void;
  selectProject: (id: string | null) => void;
  openDrawer: (id: string) => void;
  closeDrawer: () => void;
  loadProjects: (userId?: string) => Promise<void>;
  resetSession: () => void;
  addProject: (data: { name: string }) => Promise<boolean>;
  cancelCreation: () => void;
  updateProject: (id: string, updates: Patch) => void;
  retrySave: (id: string, useLatest?: boolean) => Promise<void>;
  reviewConflict: (id: string) => Promise<void>;
  discardSave: (id: string) => Promise<void>;
  setPriority: (id: string, value: Priority) => void;
  setStage: (id: string, value: Stage) => void;
  setNextAction: (id: string, value: string) => void;
  setHealth: (id: string, value: Health) => void;
  setTargetDate: (id: string, value: string | null) => void;
  setProgress: (id: string, value: number) => void;
  setLiveUrl: (id: string, value: string | undefined) => void;
  setRepoUrl: (id: string, value: string | undefined) => void;
  touchProject: (id: string) => void;
  deleteProject: (id: string) => Promise<void>;
  addActivity: (id: string, item: Omit<ActivityItem, 'id' | 'timestamp'>) => void;
  getExportPayload: () => { version: 1; exportedAt: string; projects: Project[] };
  importProjects: (projects: Project[]) => Promise<void>;
  clearAllProjects: () => Promise<void>;
  reportError: (message: string) => void;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
/** Bumped on sign-out and account switches so in-flight responses are ignored. */
let session = 0;

const RECOVERY_NOTICE =
  'Recovered unsaved changes. Review or retry to confirm they are saved.';

const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'Could not connect. Your changes have not been confirmed saved. Try again.';

/** What the user sees: confirmed values, then the in-flight edit, then newer edits. */
function visible(draft: Draft): Project {
  return { ...draft.base, ...draft.request?.patch, ...draft.patch };
}

// --- Recovery -------------------------------------------------------------
// sessionStorage is attacker-writable and survives code changes, so everything
// read back is re-validated with the same rules the server applies.

function parsePatch(value: unknown): Patch | null {
  if (!isRecord(value)) return null;
  try {
    return validateFields(value) as Patch;
  } catch {
    return null;
  }
}

const REQUIRED_PROJECT_KEYS = [
  'name',
  'nextAction',
  'stage',
  'priority',
  'health',
  'targetDate',
  'progress',
  'activity',
  'createdAt',
  'lastTouched',
];

function parseProject(value: unknown): Project | null {
  if (!isRecord(value)) return null;
  if (!Number.isInteger(value.version) || (value.version as number) < 1) return null;
  if (REQUIRED_PROJECT_KEYS.some((key) => !(key in value))) return null;
  try {
    const [project] = validateImport([value]);
    return { ...project, version: value.version as number };
  } catch {
    return null;
  }
}

function parseRequest(value: unknown): SaveRequest | null {
  if (!isRecord(value)) return null;
  if (!Number.isInteger(value.version) || (value.version as number) < 1) return null;
  const patch = parsePatch(value.patch);
  if (!patch) return null;
  try {
    return { patch, version: value.version as number, mutationId: validateId(value.mutationId) };
  } catch {
    return null;
  }
}

function parseDraft(id: string, value: unknown): Draft | null {
  if (!isRecord(value)) return null;
  const base = parseProject(value.base);
  if (!base || base.id !== id) return null;
  const patch = parsePatch(value.patch);
  if (!patch) return null;
  let request: SaveRequest | undefined;
  if (value.request !== undefined && value.request !== null) {
    request = parseRequest(value.request) ?? undefined;
    if (!request) return null;
  }
  // A draft with nothing unconfirmed is not worth restoring.
  if (!Object.keys(patch).length && !request) return null;
  return { base, patch, request, status: 'recovered', error: RECOVERY_NOTICE };
}

function parseCreation(value: unknown): Creation | null {
  if (!isRecord(value)) return null;
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 200) return null;
  try {
    return { id: validateId(value.id), name: value.name.trim() };
  } catch {
    return null;
  }
}

function readRecovered(account: string): { drafts: Record<string, Draft>; creation: Creation | null } {
  const empty = { drafts: {}, creation: null };
  if (typeof sessionStorage === 'undefined') return empty;
  const raw = sessionStorage.getItem(DRAFT_PREFIX + account);
  if (!raw) return empty;
  const stored: unknown = JSON.parse(raw);
  if (!isRecord(stored)) return empty;
  const drafts: Record<string, Draft> = {};
  if (isRecord(stored.drafts)) {
    for (const [id, value] of Object.entries(stored.drafts)) {
      const draft = parseDraft(id, value);
      if (draft) drafts[id] = draft;
    }
  }
  return { drafts, creation: parseCreation(stored.creation) };
}

function persist() {
  const { userId, drafts, creation } = useProjectStore.getState();
  if (!userId || typeof sessionStorage === 'undefined') return;
  try {
    if (!Object.keys(drafts).length && !creation) sessionStorage.removeItem(DRAFT_PREFIX + userId);
    else sessionStorage.setItem(DRAFT_PREFIX + userId, JSON.stringify({ drafts, creation }));
  } catch {
    useProjectStore.setState({
      operationError:
        'Draft recovery is unavailable in this browser. Keep this page open until your changes save.',
    });
  }
}

function operationFailed(error: unknown) {
  useProjectStore.setState({
    operationError: message(error),
    operationCode: error instanceof ApiError ? error.code : 'NETWORK',
  });
}

function changed(id: string, updates: Patch, type: ActivityItem['type'], text: string) {
  const state = useProjectStore.getState();
  const project = state.projects.find((p) => p.id === id);
  if (!project) return;
  const activity: ActivityItem = {
    id: generateId(),
    type,
    message: text,
    timestamp: new Date().toISOString(),
    author: 'You',
  };
  state.updateProject(id, {
    ...updates,
    activity: [activity, ...project.activity].slice(0, MAX_ACTIVITY_ENTRIES),
  });
}

/**
 * Sends one project's pending edits. Exactly one request per project is in flight
 * at a time; edits made meanwhile stay in `patch` and are sent by the follow-up
 * flush scheduled after the response.
 */
async function flush(id: string) {
  timers.delete(id);
  const draft = useProjectStore.getState().drafts[id];
  if (!draft || draft.status !== 'saving') return;

  const version = draft.request?.version ?? draft.base.version;
  if (!Number.isInteger(version) || (version as number) < 1) {
    // Without a known version an update cannot be safely applied; force a reload.
    useProjectStore.setState((s) => ({
      drafts: {
        ...s.drafts,
        [id]: {
          ...s.drafts[id],
          status: 'error',
          error: 'This project must be reloaded before it can be saved again.',
        },
      },
    }));
    persist();
    return;
  }

  const epoch = session;
  // Reusing the mutation id makes an explicit retry of a lost response a no-op.
  const request: SaveRequest = draft.request ?? {
    patch: draft.patch,
    version: version as number,
    mutationId: generateId(),
  };
  useProjectStore.setState((s) => ({
    drafts: {
      ...s.drafts,
      [id]: {
        base: draft.base,
        request,
        patch: draft.request ? draft.patch : {},
        status: 'saving',
      },
    },
  }));
  persist();

  try {
    const saved = await apiUpdateProject(id, {
      ...request.patch,
      version: request.version,
      mutationId: request.mutationId,
    });
    if (epoch !== session) return;
    const current = useProjectStore.getState().drafts[id];
    if (!current) return;
    const hasMore = Object.keys(current.patch).length > 0;
    const next: Draft = { base: saved, patch: current.patch, status: 'saving' };
    useProjectStore.setState((s) => {
      const drafts = { ...s.drafts };
      if (hasMore) drafts[id] = next;
      else delete drafts[id];
      return {
        drafts,
        projects: s.projects.map((p) => (p.id === id ? (hasMore ? visible(next) : saved) : p)),
      };
    });
    persist();
    if (hasMore) schedule(id);
  } catch (error) {
    if (epoch !== session) return;
    useProjectStore.setState((s) => {
      const current = s.drafts[id];
      if (!current) return {};
      return {
        drafts: {
          ...s.drafts,
          [id]: {
            ...current,
            status: error instanceof ApiError && error.status === 409 ? 'conflict' : 'error',
            error: message(error),
          },
        },
      };
    });
    persist();
  }
}

function schedule(id: string) {
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.set(
    id,
    setTimeout(() => void flush(id), SAVE_DEBOUNCE_MS)
  );
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  userId: null,
  projects: [],
  drafts: {},
  creation: null,
  creating: false,
  operationBusy: false,
  operationError: null,
  operationCode: null,
  filter: 'All',
  healthFilter: 'All',
  deadlineFilter: 'All',
  selectedId: null,
  search: '',
  isDrawerOpen: false,
  loadStatus: 'idle',
  loadError: null,

  setFilter: (filter) => set({ filter }),
  setHealthFilter: (healthFilter) => set({ healthFilter }),
  setDeadlineFilter: (deadlineFilter) => set({ deadlineFilter }),
  setSearch: (search) => set({ search }),
  selectProject: (selectedId) => set({ selectedId }),
  openDrawer: (selectedId) => set({ selectedId, isDrawerOpen: true }),
  closeDrawer: () => set({ selectedId: null, isDrawerOpen: false }),
  reportError: (operationError) => set({ operationError, operationCode: 'CLIENT' }),

  resetSession: () => {
    session++;
    timers.forEach(clearTimeout);
    timers.clear();
    set({
      userId: null,
      projects: [],
      drafts: {},
      creation: null,
      creating: false,
      operationBusy: false,
      operationError: null,
      operationCode: null,
      loadStatus: 'idle',
      loadError: null,
      selectedId: null,
      isDrawerOpen: false,
      search: '',
      filter: 'All',
      healthFilter: 'All',
      deadlineFilter: 'All',
    });
  },

  loadProjects: async (userId) => {
    const account = userId ?? get().userId;
    if (!account) return;
    if (get().userId !== account) get().resetSession();
    // Never reload over work the server has not confirmed.
    if (
      get().loadStatus === 'loading' ||
      get().operationBusy ||
      Object.values(get().drafts).some((d) => d.status === 'saving')
    ) {
      return;
    }
    set({ userId: account, loadStatus: 'loading', loadError: null });
    const epoch = session;
    try {
      const projects = await apiListProjects();
      if (epoch !== session) return;
      let drafts = get().drafts;
      let creation = get().creation;
      if (!Object.keys(drafts).length) {
        try {
          const recovered = readRecovered(account);
          drafts = recovered.drafts;
          creation = creation ?? recovered.creation;
        } catch {
          set({
            operationError: 'Could not read recovered drafts. Existing server data is unchanged.',
          });
        }
      }
      const merged = projects.map((p) => (drafts[p.id] ? visible(drafts[p.id]) : p));
      for (const [id, draft] of Object.entries(drafts)) {
        if (!projects.some((p) => p.id === id)) merged.push(visible(draft));
      }
      set({ projects: merged, drafts, creation, loadStatus: 'ready' });
    } catch (error) {
      if (epoch === session) set({ loadStatus: 'error', loadError: message(error) });
    }
  },

  addProject: async ({ name }) => {
    if (get().creating || get().operationBusy) return false;
    // The id is minted here and reused on retry, so a lost response cannot duplicate.
    const creation = get().creation ?? { id: generateId(), name: name.trim() };
    if (!creation.name) return false;
    set({ creation, creating: true, operationError: null, operationCode: null });
    persist();
    const epoch = session;
    try {
      const project = await apiCreateProject(creation);
      if (epoch !== session) return false;
      set((s) => ({
        projects: [project, ...s.projects.filter((p) => p.id !== project.id)],
        creation: null,
        creating: false,
      }));
      persist();
      return true;
    } catch (error) {
      if (epoch !== session) return false;
      set({ creating: false });
      // Ids are globally unique; one claimed by another account needs a fresh id.
      if (error instanceof ApiError && error.code === 'ID_TAKEN') {
        set((s) => ({ creation: s.creation ? { ...s.creation, id: generateId() } : null }));
      }
      persist();
      operationFailed(error);
      return false;
    }
  },

  cancelCreation: () => {
    if (get().creating) return;
    set({ creation: null, operationError: null, operationCode: null });
    persist();
  },

  updateProject: (id, updates) => {
    if (get().operationBusy) {
      set({
        operationError: 'Wait for the workspace operation to finish before editing projects.',
        operationCode: 'CLIENT',
      });
      return;
    }
    const project = get().projects.find((p) => p.id === id);
    if (!project) return;
    const old = get().drafts[id];
    const draft: Draft = old
      ? { ...old, patch: { ...old.patch, ...updates } }
      : { base: project, patch: updates, status: 'saving' };
    set((s) => ({
      drafts: { ...s.drafts, [id]: draft },
      projects: s.projects.map((p) => (p.id === id ? visible(draft) : p)),
    }));
    persist();
    // A failed or conflicted draft waits for an explicit retry rather than looping.
    if (draft.status === 'saving' && !draft.request) schedule(id);
  },

  retrySave: async (id, useLatest = false) => {
    const draft = get().drafts[id];
    if (!draft || draft.status === 'saving') return;
    if (draft.status === 'conflict' && !useLatest) return;
    let next: Draft = { ...draft, status: 'saving', error: undefined, latest: undefined };
    if (useLatest) {
      if (!draft.latest) return;
      // Rebase: keep the user's intended fields, dropped onto the server's version.
      const patch: Patch = { ...draft.request?.patch, ...draft.patch };
      if (patch.activity) {
        const baseIds = new Set(draft.base.activity.map((a) => a.id));
        patch.activity = [
          ...patch.activity.filter((a) => !baseIds.has(a.id)),
          ...draft.latest.activity,
        ]
          .filter((a, i, all) => all.findIndex((b) => b.id === a.id) === i)
          .slice(0, MAX_ACTIVITY_ENTRIES);
      }
      // Clearing `request` mints a new mutation id against the newer version.
      next = { base: draft.latest, patch, status: 'saving' };
    }
    set((s) => ({
      drafts: { ...s.drafts, [id]: next },
      projects: s.projects.map((p) => (p.id === id ? visible(next) : p)),
    }));
    await flush(id);
  },

  reviewConflict: async (id) => {
    const epoch = session;
    try {
      const latest = await apiGetProject(id);
      if (epoch !== session || !get().drafts[id]) return;
      set((s) => ({ drafts: { ...s.drafts, [id]: { ...s.drafts[id], latest } } }));
    } catch (error) {
      if (epoch === session) operationFailed(error);
    }
  },

  discardSave: async (id) => {
    if (get().drafts[id]?.status === 'saving') return;
    const epoch = session;
    try {
      let latest: Project | undefined;
      try {
        latest = await apiGetProject(id);
      } catch (error) {
        // A discarded draft for a project deleted elsewhere simply disappears.
        if (!(error instanceof ApiError && error.status === 404)) throw error;
      }
      if (epoch !== session) return;
      set((s) => {
        const drafts = { ...s.drafts };
        delete drafts[id];
        return {
          drafts,
          projects: latest
            ? s.projects.map((p) => (p.id === id ? latest! : p))
            : s.projects.filter((p) => p.id !== id),
        };
      });
      persist();
    } catch (error) {
      if (epoch === session) operationFailed(error);
    }
  },

  setPriority: (id, priority) => changed(id, { priority }, 'priority', `Priority updated to ${priority}`),
  setStage: (id, stage) => changed(id, { stage }, 'stage', `Stage changed to ${stage}`),
  setNextAction: (id, nextAction) =>
    changed(id, { nextAction }, 'action', `Next action updated: ${nextAction.slice(0, 100)}`),
  setHealth: (id, health) => changed(id, { health }, 'health', `Health set to ${health}`),
  setTargetDate: (id, targetDate) =>
    changed(
      id,
      { targetDate },
      'target',
      targetDate ? `Target date set to ${targetDate}` : 'Target date cleared'
    ),
  setProgress: (id, value) => {
    const progress = Math.max(0, Math.min(100, Math.round(value)));
    changed(id, { progress }, 'action', `Progress set to ${progress}%`);
  },
  setLiveUrl: (id, liveUrl) => changed(id, { liveUrl: liveUrl?.trim() || null }, 'action', 'Live URL updated'),
  setRepoUrl: (id, repoUrl) => changed(id, { repoUrl: repoUrl?.trim() || null }, 'action', 'Repo URL updated'),
  touchProject: (id) => changed(id, {}, 'touched', 'Touched'),
  addActivity: (id, item) => changed(id, {}, item.type, item.message),

  deleteProject: async (id) => {
    if (get().operationBusy || get().drafts[id]) {
      set({
        operationError: 'Save or discard this project’s changes before deleting it.',
        operationCode: 'CLIENT',
      });
      return;
    }
    const project = get().projects.find((p) => p.id === id);
    if (!project) return;
    if (!Number.isInteger(project.version)) {
      set({
        operationError: 'Reload your workspace before deleting this project.',
        operationCode: 'CLIENT',
      });
      return;
    }
    const epoch = session;
    set({ operationBusy: true, operationError: null, operationCode: null });
    try {
      await apiDeleteProject(id, project.version as number);
      if (epoch !== session) return;
      set((s) => ({
        projects: s.projects.filter((p) => p.id !== id),
        selectedId: null,
        isDrawerOpen: false,
      }));
    } catch (error) {
      if (epoch === session) operationFailed(error);
    } finally {
      if (epoch === session) set({ operationBusy: false });
    }
  },

  getExportPayload: () => ({
    version: 1,
    exportedAt: new Date().toISOString(),
    projects: get().projects,
  }),

  importProjects: async (incoming) => {
    // Import replaces everything, so it must not race unconfirmed per-project work.
    if (get().operationBusy || get().creating || get().creation || Object.keys(get().drafts).length) {
      set({
        operationError: 'Save or discard pending changes before replacing your workspace.',
        operationCode: 'CLIENT',
      });
      return;
    }
    const epoch = session;
    set({ operationBusy: true, operationError: null, operationCode: null });
    try {
      const list = validateImport(incoming);
      const versions = Object.fromEntries(get().projects.map((p) => [p.id, p.version ?? 1]));
      const projects = await apiImportProjects(list, versions);
      if (epoch !== session) return;
      set({ projects, selectedId: null, isDrawerOpen: false });
    } catch (error) {
      if (epoch === session) operationFailed(error);
    } finally {
      if (epoch === session) set({ operationBusy: false });
    }
  },

  clearAllProjects: async () => get().importProjects([]),
}));
