import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  formatDistanceToNow,
  isToday,
  isYesterday,
  format,
  differenceInCalendarDays,
  startOfDay,
} from 'date-fns';
import type { Stage, DeadlineState, Health } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatLastTouched(iso: string): string {
  const date = new Date(iso);
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return formatDistanceToNow(date, { addSuffix: true });
}

export function formatFullDate(iso: string): string {
  return format(new Date(iso), 'MMM d, yyyy · h:mm a');
}

/** Local calendar date as YYYY-MM-DD */
export function toLocalDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse YYYY-MM-DD as local midnight */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatTargetDate(dateStr: string | null): string {
  if (!dateStr) return 'No target date';
  try {
    return format(parseLocalDate(dateStr), 'MMM d, yyyy');
  } catch {
    return 'Invalid date';
  }
}

/**
 * Deadline state using the user's local calendar date.
 * Non-active stages (Live / Paused / Archived) are treated as inactive.
 */
export function getDeadlineState(
  targetDate: string | null,
  stage: Stage
): DeadlineState {
  if (stage === 'Live' || stage === 'Paused' || stage === 'Archived') {
    return 'inactive';
  }
  if (!targetDate) return 'none';

  const today = startOfDay(new Date());
  const target = startOfDay(parseLocalDate(targetDate));
  const diff = differenceInCalendarDays(target, today);

  if (diff < 0) return 'overdue';
  if (diff === 0) return 'due-today';
  if (diff <= 7) return 'due-soon';
  return 'future';
}

export function deadlineLabel(state: DeadlineState): string {
  switch (state) {
    case 'none':
      return 'No target date';
    case 'overdue':
      return 'Overdue';
    case 'due-today':
      return 'Due today';
    case 'due-soon':
      return 'Due soon';
    case 'future':
      return 'Upcoming';
    case 'inactive':
      return '—';
  }
}

export const HEALTH_OPTIONS: Health[] = ['On track', 'At risk', 'Blocked'];

export const HEALTH_HELP: Record<Health, string> = {
  'On track': 'Progress is healthy and the target looks achievable.',
  'At risk': 'Something is threatening the timeline or scope — watch closely.',
  Blocked: 'Work cannot proceed until an external dependency is resolved.',
};

export function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}
