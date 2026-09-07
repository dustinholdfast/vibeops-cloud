import type { ActivityItem, Project } from '../types';
import { isActiveStage, staleDaysFor } from './portfolio';

/** The review window the dashboard shows by default. */
export const REVIEW_WINDOW_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How much each kind of event says about real forward motion. A stage change is
 * the strongest signal a project actually moved; a bare "touched" barely counts,
 * and creation is birth rather than progress.
 */
const EVENT_WEIGHT: Record<ActivityItem['type'], number> = {
  stage: 3,
  action: 2,
  comment: 2,
  health: 2,
  target: 1,
  priority: 1,
  touched: 0.5,
  created: 0,
};

export type MomentumState = 'accelerating' | 'steady' | 'slowing' | 'stalled';

export type ProjectMomentum = {
  state: MomentumState;
  /** Weighted effort inside the current window. */
  recent: number;
  /** Weighted effort inside the window immediately before it. */
  prior: number;
  /** Raw count of scoring events in the current window. */
  events: number;
};

export type TimelineEntry = {
  project: Project;
  item: ActivityItem;
  at: Date;
};

export type StalledProject = {
  project: Project;
  staleDays: number;
};

export type PortfolioReview = {
  window: { start: Date; end: Date; days: number };
  /** Reached Live during the window. */
  shipped: Project[];
  /** Still active, but changed stage during the window. */
  advanced: Project[];
  /** Active work whose health was downgraded during the window. */
  slipped: Project[];
  /** Active work with nothing to show for the window. */
  stalled: StalledProject[];
  /** Every event in the window, newest first, attributed to its project. */
  timeline: TimelineEntry[];
  activeCount: number;
  /** Active projects that saw at least one event in the window. */
  touchedCount: number;
  headline: string;
};

/** Activity timestamps come from the client and the database; treat them as untrusted. */
function activityDate(item: ActivityItem): Date | null {
  const at = new Date(item.timestamp);
  return Number.isNaN(at.getTime()) ? null : at;
}

function classify(recent: number, prior: number): MomentumState {
  if (recent === 0) return 'stalled';
  if (prior === 0) return 'accelerating';
  const ratio = recent / prior;
  if (ratio >= 1.5) return 'accelerating';
  if (ratio <= 0.5) return 'slowing';
  return 'steady';
}

/**
 * Compares weighted activity in the last `windowDays` against the window before
 * it, so a project that has quietly gone quiet reads differently from one that
 * was never busy.
 */
export function projectMomentum(
  project: Project,
  now: Date = new Date(),
  windowDays: number = REVIEW_WINDOW_DAYS
): ProjectMomentum {
  const end = now.getTime();
  const windowMs = windowDays * DAY_MS;
  const start = end - windowMs;
  const priorStart = start - windowMs;

  let recent = 0;
  let prior = 0;
  let events = 0;

  for (const item of project.activity) {
    const at = activityDate(item);
    if (!at) continue;
    const time = at.getTime();
    // A timestamp in the future is clock skew, not progress.
    if (time > end) continue;
    const weight = EVENT_WEIGHT[item.type] ?? 0;
    if (time >= start) {
      recent += weight;
      if (weight > 0) events += 1;
    } else if (time >= priorStart) {
      prior += weight;
    }
  }

  return { state: classify(recent, prior), recent, prior, events };
}

function buildHeadline(review: Omit<PortfolioReview, 'headline'>): string {
  if (review.activeCount === 0) {
    return 'No active projects to review.';
  }
  if (review.timeline.length === 0) {
    return `Nothing moved in the last ${review.window.days} days.`;
  }

  const parts: string[] = [];
  if (review.shipped.length) parts.push(`${review.shipped.length} shipped`);
  if (review.advanced.length) parts.push(`${review.advanced.length} advanced`);
  if (review.slipped.length) parts.push(`${review.slipped.length} slipped`);
  if (review.stalled.length) parts.push(`${review.stalled.length} stalled`);

  if (parts.length === 0) {
    return `Steady week — ${review.touchedCount} of ${review.activeCount} active projects saw work.`;
  }
  return `${parts.join(' · ')} over ${review.window.days} days.`;
}

/**
 * Summarises what actually happened across the portfolio in the last
 * `windowDays`. Everything is derived from event types, timestamps and current
 * project state — never from activity message text, which is free-form.
 */
export function buildPortfolioReview(
  projects: Project[],
  now: Date = new Date(),
  windowDays: number = REVIEW_WINDOW_DAYS
): PortfolioReview {
  const end = now;
  const start = new Date(now.getTime() - windowDays * DAY_MS);

  const timeline: TimelineEntry[] = [];
  const shipped: Project[] = [];
  const advanced: Project[] = [];
  const slipped: Project[] = [];
  const stalled: StalledProject[] = [];
  let activeCount = 0;
  let touchedCount = 0;

  for (const project of projects) {
    const inWindow: ActivityItem[] = [];
    for (const item of project.activity) {
      const at = activityDate(item);
      if (!at || at < start || at > end) continue;
      inWindow.push(item);
      timeline.push({ project, item, at });
    }

    const active = isActiveStage(project.stage);
    if (active) activeCount += 1;

    if (inWindow.some((item) => item.type === 'stage')) {
      if (project.stage === 'Live') shipped.push(project);
      else if (active) advanced.push(project);
    }

    if (!active) continue;

    if (inWindow.length > 0) touchedCount += 1;

    if (project.health !== 'On track' && inWindow.some((item) => item.type === 'health')) {
      slipped.push(project);
    }

    // A project born inside the window has not had a full window to move yet.
    const createdAt = new Date(project.createdAt);
    const bornBeforeWindow = Number.isNaN(createdAt.getTime()) || createdAt < start;
    if (bornBeforeWindow && projectMomentum(project, now, windowDays).state === 'stalled') {
      stalled.push({ project, staleDays: staleDaysFor(project, now) });
    }
  }

  timeline.sort((a, b) => b.at.getTime() - a.at.getTime());
  stalled.sort((a, b) => b.staleDays - a.staleDays);

  const review = {
    window: { start, end, days: windowDays },
    shipped,
    advanced,
    slipped,
    stalled,
    timeline,
    activeCount,
    touchedCount,
  };

  return { ...review, headline: buildHeadline(review) };
}
