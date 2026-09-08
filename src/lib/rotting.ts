import type { Project } from '../types';
import { staleDaysFor } from './portfolio';

export const ROTTING_AFTER_DAYS = 7;

export function isRotting(project: Project, now: Date = new Date()): boolean {
  if (project.stage === 'Archived' || project.stage === 'Live') return false;
  return staleDaysFor(project, now) >= ROTTING_AFTER_DAYS;
}

export function quietLabel(project: Project, now: Date = new Date()): string {
  return `quiet ${staleDaysFor(project, now)}d`;
}
