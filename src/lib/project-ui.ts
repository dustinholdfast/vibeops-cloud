import type { Health, Stage } from '../types';

export const stageColor: Record<Stage, string> = {
  Exploring: 'bg-blue',
  Building: 'bg-purple',
  Testing: 'bg-orange',
  Live: 'bg-success',
  Paused: 'bg-text-dim',
  Archived: 'bg-text-dim',
};

export const healthStyles: Record<Health, string> = {
  'On track': 'bg-success/15 text-success border-success/30',
  'At risk': 'bg-warning/15 text-warning border-warning/30',
  Blocked: 'bg-danger/15 text-danger border-danger/30',
};

export const BOARD_STAGES: Stage[] = ['Exploring', 'Building', 'Testing', 'Live'];
export const PARKED_STAGES: Stage[] = ['Paused', 'Archived'];

export const VIEW_STORAGE_KEY = 'vibeops-cloud:project-view';
export type ProjectView = 'list' | 'board';

export function readStoredView(): ProjectView {
  if (typeof localStorage === 'undefined') return 'list';
  try {
    const value = localStorage.getItem(VIEW_STORAGE_KEY);
    return value === 'board' ? 'board' : 'list';
  } catch {
    return 'list';
  }
}

export function writeStoredView(view: ProjectView) {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, view);
  } catch {
    // private mode
  }
}

export const chip =
  'rounded-full bg-surface-elevated px-2 py-0.5 text-[11px] text-text-muted';
