import type { Health, Stage } from '../types';
import { useProjectStore } from '../store/useProjectStore';
import { TOAST_MS, useToastStore } from '../store/useToastStore';

export function toastDelete(ids: string[]) {
  const queued = useProjectStore.getState().queueDelete(ids);
  if (!queued.length) return;
  const message = queued.length === 1 ? 'Project deleted' : `${queued.length} projects deleted`;
  useToastStore.getState().show({
    message,
    actionLabel: 'Undo',
    duration: TOAST_MS,
    onAction: () => useProjectStore.getState().undoDelete(queued),
    onExpire: () => void useProjectStore.getState().commitDelete(queued),
  });
}

export function toastBatchStage(ids: string[], stage: Stage) {
  const state = useProjectStore.getState();
  const previous = ids
    .map((id) => {
      const project = state.projects.find((p) => p.id === id);
      return project ? { id, stage: project.stage } : null;
    })
    .filter((row): row is { id: string; stage: Stage } => Boolean(row));
  if (!previous.length) return;
  for (const row of previous) state.setStage(row.id, stage);
  useToastStore.getState().show({
    message: `${previous.length === 1 ? 'Stage' : `${previous.length} projects`} set to ${stage}`,
    actionLabel: 'Undo',
    onAction: () => {
      const store = useProjectStore.getState();
      for (const row of previous) store.setStage(row.id, row.stage);
    },
  });
}

export function toastBatchHealth(ids: string[], health: Health) {
  const state = useProjectStore.getState();
  const previous = ids
    .map((id) => {
      const project = state.projects.find((p) => p.id === id);
      return project ? { id, health: project.health } : null;
    })
    .filter((row): row is { id: string; health: Health } => Boolean(row));
  if (!previous.length) return;
  for (const row of previous) state.setHealth(row.id, health);
  useToastStore.getState().show({
    message: `${previous.length === 1 ? 'Health' : `${previous.length} projects`} set to ${health}`,
    actionLabel: 'Undo',
    onAction: () => {
      const store = useProjectStore.getState();
      for (const row of previous) store.setHealth(row.id, row.health);
    },
  });
}
