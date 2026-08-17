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
  apiListProjects,
  apiCreateProject,
  apiUpdateProject,
  apiDeleteProject,
  apiImportProjects,
} from '../lib/api';

export const MAX_NOW_SLOTS = 3;

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface ProjectState {
  projects: Project[];
  filter: FilterStage;
  healthFilter: FilterHealth;
  deadlineFilter: FilterDeadline;
  selectedId: string | null;
  search: string;
  isDrawerOpen: boolean;
  loadStatus: LoadStatus;
  loadError: string | null;

  setFilter: (f: FilterStage) => void;
  setHealthFilter: (f: FilterHealth) => void;
  setDeadlineFilter: (f: FilterDeadline) => void;
  setSearch: (s: string) => void;
  selectProject: (id: string | null) => void;
  openDrawer: (id: string) => void;
  closeDrawer: () => void;

  /** Load projects for the signed-in user from the API */
  loadProjects: () => Promise<void>;

  addProject: (data: {
    name: string;
    nextAction?: string;
    stage?: Stage;
    priority?: Priority;
    health?: Health;
    targetDate?: string | null;
  }) => Promise<void>;
  updateProject: (id: string, updates: Partial<Project>) => void;
  setPriority: (id: string, priority: Priority) => void;
  setStage: (id: string, stage: Stage) => void;
  setNextAction: (id: string, nextAction: string) => void;
  setHealth: (id: string, health: Health) => void;
  setTargetDate: (id: string, targetDate: string | null) => void;
  setProgress: (id: string, progress: number) => void;
  setLiveUrl: (id: string, liveUrl: string | undefined) => void;
  setRepoUrl: (id: string, repoUrl: string | undefined) => void;
  touchProject: (id: string) => void;
  deleteProject: (id: string) => Promise<void>;
  addActivity: (id: string, item: Omit<ActivityItem, 'id' | 'timestamp'>) => void;
  getExportPayload: () => { version: 1; exportedAt: string; projects: Project[] };
  importProjects: (projects: Project[]) => Promise<void>;
  clearAllProjects: () => Promise<void>;
}

/** Persist full project row after optimistic local edits */
async function syncProject(get: () => ProjectState, id: string) {
  const project = get().projects.find((p) => p.id === id);
  if (!project) return;
  try {
    const saved = await apiUpdateProject(id, {
      name: project.name,
      nextAction: project.nextAction,
      stage: project.stage,
      priority: project.priority,
      health: project.health,
      targetDate: project.targetDate,
      liveUrl: project.liveUrl,
      repoUrl: project.repoUrl,
      progress: project.progress,
      activity: project.activity,
    });
    // Reconcile with server timestamps if needed
    get().projects; // no-op keep lint happy in some setups
    useProjectStore.setState((s) => ({
      projects: s.projects.map((p) => (p.id === id ? { ...p, ...saved } : p)),
    }));
  } catch (e) {
    console.error('[vibeops] sync failed', id, e);
  }
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  projects: [],
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
  selectProject: (id) => set({ selectedId: id }),
  openDrawer: (id) => set({ selectedId: id, isDrawerOpen: true }),
  closeDrawer: () => set({ isDrawerOpen: false, selectedId: null }),

  loadProjects: async () => {
    set({ loadStatus: 'loading', loadError: null });
    try {
      const projects = await apiListProjects();
      set({ projects, loadStatus: 'ready', loadError: null });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load projects';
      set({ loadStatus: 'error', loadError: message, projects: [] });
    }
  },

  addProject: async ({
    name,
    nextAction = 'Define the first slice',
    stage = 'Exploring',
    priority = 'Later',
    health = 'On track',
    targetDate = null,
  }) => {
    try {
      const project = await apiCreateProject({
        name,
        nextAction,
        stage,
        priority,
        health,
        targetDate,
      });
      set((s) => ({ projects: [project, ...s.projects] }));
    } catch (e) {
      console.error('[vibeops] create failed', e);
      // Optimistic fallback so UI still works if API is down
      const now = new Date().toISOString();
      const project: Project = {
        id: generateId(),
        name,
        nextAction,
        stage,
        priority,
        health,
        targetDate,
        lastTouched: now,
        createdAt: now,
        progress: 0,
        activity: [
          {
            id: generateId(),
            type: 'created',
            message: 'Project created',
            timestamp: now,
            author: 'You',
          },
        ],
      };
      set((s) => ({ projects: [project, ...s.projects] }));
    }
  },

  updateProject: (id, updates) => {
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === id
          ? { ...p, ...updates, lastTouched: new Date().toISOString() }
          : p
      ),
    }));
    void syncProject(get, id);
  },

  setPriority: (id, priority) => {
    const project = get().projects.find((p) => p.id === id);
    if (!project || project.priority === priority) return;
    get().addActivity(id, {
      type: 'priority',
      message: `Priority updated to ${priority}`,
      author: 'You',
    });
    get().updateProject(id, { priority });
  },

  setStage: (id, stage) => {
    const project = get().projects.find((p) => p.id === id);
    if (!project || project.stage === stage) return;
    get().addActivity(id, {
      type: 'stage',
      message: `Stage changed to ${stage}`,
      author: 'You',
    });
    get().updateProject(id, { stage });
  },

  setNextAction: (id, nextAction) => {
    get().addActivity(id, {
      type: 'action',
      message: `Next action updated: “${nextAction.slice(0, 40)}${nextAction.length > 40 ? '…' : ''}”`,
      author: 'You',
    });
    get().updateProject(id, { nextAction });
  },

  setHealth: (id, health) => {
    const project = get().projects.find((p) => p.id === id);
    if (!project || project.health === health) return;
    get().addActivity(id, {
      type: 'health',
      message: `Health set to ${health}`,
      author: 'You',
    });
    get().updateProject(id, { health });
  },

  setTargetDate: (id, targetDate) => {
    const project = get().projects.find((p) => p.id === id);
    if (!project) return;
    if (project.targetDate === targetDate) return;
    get().addActivity(id, {
      type: 'target',
      message: targetDate ? `Target date set to ${targetDate}` : 'Target date cleared',
      author: 'You',
    });
    get().updateProject(id, { targetDate });
  },

  setProgress: (id, progress) => {
    const clamped = Math.max(0, Math.min(100, Math.round(progress)));
    const project = get().projects.find((p) => p.id === id);
    if (!project || project.progress === clamped) return;
    get().addActivity(id, {
      type: 'action',
      message: `Progress set to ${clamped}%`,
      author: 'You',
    });
    get().updateProject(id, { progress: clamped });
  },

  setLiveUrl: (id, liveUrl) => {
    const normalized = liveUrl?.trim() || undefined;
    const project = get().projects.find((p) => p.id === id);
    if (!project) return;
    if ((project.liveUrl || undefined) === normalized) return;
    get().addActivity(id, {
      type: 'action',
      message: normalized ? 'Live URL set' : 'Live URL cleared',
      author: 'You',
    });
    get().updateProject(id, { liveUrl: normalized });
  },

  setRepoUrl: (id, repoUrl) => {
    const normalized = repoUrl?.trim() || undefined;
    const project = get().projects.find((p) => p.id === id);
    if (!project) return;
    if ((project.repoUrl || undefined) === normalized) return;
    get().addActivity(id, {
      type: 'action',
      message: normalized ? 'Repo URL set' : 'Repo URL cleared',
      author: 'You',
    });
    get().updateProject(id, { repoUrl: normalized });
  },

  touchProject: (id) => {
    get().addActivity(id, { type: 'touched', message: 'Touched', author: 'You' });
    get().updateProject(id, {});
  },

  deleteProject: async (id) => {
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
      isDrawerOpen: s.selectedId === id ? false : s.isDrawerOpen,
    }));
    try {
      await apiDeleteProject(id);
    } catch (e) {
      console.error('[vibeops] delete failed', e);
      // Reload to reconcile
      void get().loadProjects();
    }
  },

  addActivity: (id, item) => {
    const activityItem: ActivityItem = {
      ...item,
      id: generateId(),
      timestamp: new Date().toISOString(),
    };
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === id
          ? { ...p, activity: [activityItem, ...p.activity].slice(0, 50) }
          : p
      ),
    }));
  },

  getExportPayload: () => ({
    version: 1 as const,
    exportedAt: new Date().toISOString(),
    projects: get().projects,
  }),

  importProjects: async (incoming) => {
    if (!Array.isArray(incoming)) return;
    const sanitized: Project[] = incoming
      .filter((p) => p && typeof p === 'object' && typeof p.name === 'string')
      .map((p) => ({
        id: typeof p.id === 'string' ? p.id : generateId(),
        name: String(p.name),
        nextAction:
          typeof p.nextAction === 'string' ? p.nextAction : 'Define the first slice',
        stage: (['Exploring', 'Building', 'Testing', 'Live', 'Paused', 'Archived'].includes(
          p.stage
        )
          ? p.stage
          : 'Exploring') as Stage,
        priority: (['Now', 'Next', 'Later'].includes(p.priority)
          ? p.priority
          : 'Later') as Priority,
        health: (['On track', 'At risk', 'Blocked'].includes(p.health)
          ? p.health
          : 'On track') as Health,
        targetDate: typeof p.targetDate === 'string' ? p.targetDate : null,
        lastTouched:
          typeof p.lastTouched === 'string' ? p.lastTouched : new Date().toISOString(),
        createdAt: typeof p.createdAt === 'string' ? p.createdAt : new Date().toISOString(),
        liveUrl: typeof p.liveUrl === 'string' ? p.liveUrl : undefined,
        repoUrl: typeof p.repoUrl === 'string' ? p.repoUrl : undefined,
        progress:
          typeof p.progress === 'number' ? Math.max(0, Math.min(100, p.progress)) : 0,
        activity: Array.isArray(p.activity) ? p.activity.slice(0, 50) : [],
      }));

    try {
      const projects = await apiImportProjects(sanitized);
      set({ projects, selectedId: null, isDrawerOpen: false });
    } catch (e) {
      console.error('[vibeops] import failed', e);
      set({ projects: sanitized, selectedId: null, isDrawerOpen: false });
    }
  },

  clearAllProjects: async () => {
    try {
      await apiImportProjects([]);
    } catch (e) {
      console.error('[vibeops] clear failed', e);
    }
    set({ projects: [], selectedId: null, isDrawerOpen: false });
  },
}));
