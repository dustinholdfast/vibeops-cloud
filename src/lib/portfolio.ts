import { differenceInCalendarDays, startOfDay } from 'date-fns';
import type { DeadlineState, Project } from '../types';
import { getDeadlineState } from './utils';

export type PortfolioRecommendation = {
  project: Project;
  score: number;
  reasons: string[];
  deadline: DeadlineState;
  staleDays: number;
};

const ACTIVE_STAGES = new Set<Project['stage']>(['Exploring', 'Building', 'Testing']);

/** Active = the work is meant to be moving. Live/Paused/Archived are not. */
export function isActiveStage(stage: Project['stage']): boolean {
  return ACTIVE_STAGES.has(stage);
}

/** Whole local days since the project was last touched, never negative. */
export function staleDaysFor(project: Project, now: Date = new Date()): number {
  return Math.max(
    0,
    differenceInCalendarDays(startOfDay(now), startOfDay(new Date(project.lastTouched)))
  );
}

/**
 * Ranks active projects by operational urgency. The score is deliberately
 * transparent: risks and deadlines outweigh an existing priority label, while
 * staleness gently lifts work that has quietly fallen out of view.
 */
export function rankPortfolio(
  projects: Project[],
  now: Date = new Date()
): PortfolioRecommendation[] {
  return projects
    .filter((project) => isActiveStage(project.stage))
    .map((project) => {
      const deadline = getDeadlineState(project.targetDate, project.stage, now);
      const staleDays = staleDaysFor(project, now);
      const reasons: string[] = [];
      let score = 0;

      if (project.health === 'Blocked') {
        score += 100;
        reasons.push('Blocked');
      } else if (project.health === 'At risk') {
        score += 45;
        reasons.push('At risk');
      }

      if (deadline === 'overdue') {
        score += 80;
        reasons.push('Overdue');
      } else if (deadline === 'due-today') {
        score += 60;
        reasons.push('Due today');
      } else if (deadline === 'due-soon') {
        score += 30;
        reasons.push('Due soon');
      }

      if (project.priority === 'Now') score += 30;
      if (project.priority === 'Next') score += 15;
      if (staleDays >= 7) {
        score += Math.min(30, staleDays);
        reasons.push(`Untouched ${staleDays} days`);
      }
      if (project.stage === 'Testing') score += 8;

      if (reasons.length === 0) {
        reasons.push(project.priority === 'Now' ? 'Claimed for today' : 'Ready to move forward');
      }

      return { project, score, reasons, deadline, staleDays };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        new Date(a.project.createdAt).getTime() - new Date(b.project.createdAt).getTime()
    );
}

