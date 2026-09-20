'use client';

import { create } from 'zustand';
import { generateId } from '../lib/utils';

export const TOAST_MS = 5000;

export type Toast = {
  id: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onExpire?: () => void;
  duration: number;
};

const timers = new Map<string, ReturnType<typeof setTimeout>>();

type ToastState = {
  toasts: Toast[];
  show: (toast: Omit<Toast, 'id' | 'duration'> & { id?: string; duration?: number }) => string;
  dismiss: (id: string, expired?: boolean) => void;
  clear: () => void;
};

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],
  show: (toast) => {
    const id = toast.id ?? generateId();
    const duration = toast.duration ?? TOAST_MS;
    const next: Toast = { ...toast, id, duration };
    const existing = timers.get(id);
    if (existing) clearTimeout(existing);
    set((s) => ({ toasts: [...s.toasts.filter((t) => t.id !== id), next] }));
    if (duration > 0) {
      timers.set(
        id,
        setTimeout(() => get().dismiss(id, true), duration)
      );
    }
    return id;
  },
  dismiss: (id, expired = false) => {
    const timer = timers.get(id);
    if (timer) clearTimeout(timer);
    timers.delete(id);
    const toast = get().toasts.find((t) => t.id === id);
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    if (expired) toast?.onExpire?.();
  },
  clear: () => {
    timers.forEach(clearTimeout);
    timers.clear();
    set({ toasts: [] });
  },
}));
