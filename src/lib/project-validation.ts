import { isRecord } from './validation';
import type { Project } from '../types';

export const MAX_ACTIVITY_ENTRIES = 50;

const STAGES = ['Exploring', 'Building', 'Testing', 'Live', 'Paused', 'Archived'];
const PRIORITIES = ['Now', 'Next', 'Later'];
const HEALTHS = ['On track', 'At risk', 'Blocked'];
const ACTIVITY_TYPES = [
  'stage',
  'priority',
  'action',
  'comment',
  'created',
  'touched',
  'health',
  'target',
];

export class ProjectError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

function invalid(message: string): never {
  throw new ProjectError(400, 'VALIDATION', message);
}

export function validateId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) {
    invalid('Invalid project identifier.');
  }
  return value as string;
}

type Editable = Pick<
  Project,
  | 'name'
  | 'nextAction'
  | 'stage'
  | 'priority'
  | 'health'
  | 'targetDate'
  | 'progress'
  | 'liveUrl'
  | 'repoUrl'
  | 'activity'
>;

function validateEnum(result: Record<string, unknown>, value: Record<string, unknown>) {
  const enums: Record<string, string[]> = {
    stage: STAGES,
    priority: PRIORITIES,
    health: HEALTHS,
  };
  for (const [key, options] of Object.entries(enums)) {
    if (!(key in value)) continue;
    if (typeof value[key] !== 'string' || !options.includes(value[key] as string)) {
      invalid(`Invalid ${key}.`);
    }
    result[key] = value[key];
  }
}

function validateText(result: Record<string, unknown>, value: Record<string, unknown>) {
  for (const [key, max] of [
    ['name', 200],
    ['nextAction', 4000],
  ] as const) {
    if (!(key in value)) continue;
    const field = value[key];
    if (typeof field !== 'string' || !field.trim() || field.length > max) {
      invalid(`${key} must contain 1–${max} characters.`);
    }
    result[key] = (field as string).trim();
  }
}

function validateUrls(result: Record<string, unknown>, value: Record<string, unknown>) {
  for (const key of ['liveUrl', 'repoUrl'] as const) {
    if (!(key in value)) continue;
    const url = value[key];
    // Clearing a link is expressed as null; '' and undefined mean the same thing.
    if (url === null || url === '' || url === undefined) {
      result[key] = null;
      continue;
    }
    if (typeof url !== 'string' || url.length > 2048) invalid('Enter a valid HTTP or HTTPS URL.');
    try {
      const parsed = new URL(url);
      if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) {
        invalid('Enter a valid HTTP or HTTPS URL.');
      }
    } catch {
      invalid('Enter a valid HTTP or HTTPS URL.');
    }
    result[key] = url;
  }
}

function validateActivity(result: Record<string, unknown>, value: Record<string, unknown>) {
  if (!('activity' in value)) return;
  if (!Array.isArray(value.activity) || value.activity.length > MAX_ACTIVITY_ENTRIES) {
    invalid(`Activity must contain at most ${MAX_ACTIVITY_ENTRIES} entries.`);
  }
  for (const item of value.activity) {
    const ok =
      isRecord(item) &&
      typeof item.id === 'string' &&
      typeof item.message === 'string' &&
      item.message.length <= 5000 &&
      typeof item.timestamp === 'string' &&
      Number.isFinite(Date.parse(item.timestamp)) &&
      ACTIVITY_TYPES.includes(String(item.type)) &&
      (item.author === undefined ||
        (typeof item.author === 'string' && item.author.length <= 200));
    if (!ok) invalid('Invalid activity entry.');
  }
  result.activity = value.activity;
}

/** Validates only the keys present, so callers can send partial patches. */
export function validateFields(value: unknown): Partial<Editable> {
  if (!isRecord(value)) invalid('Expected project details.');
  const result: Record<string, unknown> = {};
  validateEnum(result, value);
  validateText(result, value);

  if ('progress' in value) {
    if (
      !Number.isInteger(value.progress) ||
      (value.progress as number) < 0 ||
      (value.progress as number) > 100
    ) {
      invalid('Progress must be a whole number between 0 and 100.');
    }
    result.progress = value.progress;
  }

  if ('targetDate' in value) {
    const date = value.targetDate;
    const validDate =
      date === null ||
      (typeof date === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(date) &&
        Number.isFinite(Date.parse(date)) &&
        new Date(date).toISOString().slice(0, 10) === date);
    if (!validDate) invalid('Choose a valid target date.');
    result.targetDate = date;
  }

  validateUrls(result, value);
  validateActivity(result, value);
  return result as Partial<Editable>;
}

/**
 * Imports come from files the user may have exported months ago, so anything the
 * database can default is optional here. Only a usable id and name are required;
 * present-but-wrong values are still rejected so a corrupt file cannot be written.
 */
function validateImportedProject(item: unknown, ids: Set<string>): Project {
  if (!isRecord(item)) invalid('Invalid project in import.');
  const id = validateId(item.id);
  if (ids.has(id)) invalid('Import contains duplicate project identifiers.');
  ids.add(id);

  // Older exports can hold a longer history than a single save is allowed to send.
  const trimmed = Array.isArray(item.activity)
    ? { ...item, activity: item.activity.slice(0, MAX_ACTIVITY_ENTRIES) }
    : item;
  const fields = validateFields(trimmed);
  if (!fields.name) invalid('Import project is missing name.');

  const timestamps: Record<string, string> = {};
  for (const key of ['createdAt', 'lastTouched'] as const) {
    const raw = item[key];
    if (raw === undefined || raw === null) {
      timestamps[key] = new Date().toISOString();
      continue;
    }
    if (typeof raw !== 'string' || !Number.isFinite(Date.parse(raw))) invalid(`Invalid ${key}.`);
    timestamps[key] = raw;
  }

  return {
    nextAction: 'Define the first slice',
    stage: 'Exploring',
    priority: 'Later',
    health: 'On track',
    targetDate: null,
    progress: 0,
    activity: [],
    ...fields,
    id,
    name: fields.name,
    createdAt: timestamps.createdAt,
    lastTouched: timestamps.lastTouched,
  };
}

export function validateImport(body: unknown): Project[] {
  const list = Array.isArray(body) ? body : isRecord(body) ? body.projects : undefined;
  if (!Array.isArray(list)) invalid('Expected an array of projects.');
  if (list.length > 10000) invalid('Import at most 10,000 projects at a time.');
  const ids = new Set<string>();
  return list.map((item) => validateImportedProject(item, ids));
}
