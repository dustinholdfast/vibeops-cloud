export type Stage = 'Exploring' | 'Building' | 'Testing' | 'Live' | 'Paused' | 'Archived';
export type Priority = 'Now' | 'Next' | 'Later';
export type Health = 'On track' | 'At risk' | 'Blocked';

export type DeadlineState = 'none' | 'overdue' | 'due-today' | 'due-soon' | 'future' | 'inactive';

export interface ActivityItem {
  id: string;
  type: 'stage' | 'priority' | 'action' | 'comment' | 'created' | 'touched' | 'health' | 'target';
  message: string;
  timestamp: string;
  author?: string;
}

export interface Project {
  id: string;
  name: string;
  nextAction: string;
  stage: Stage;
  priority: Priority;
  health: Health;
  targetDate: string | null; // YYYY-MM-DD (local calendar date)
  lastTouched: string; // ISO datetime
  createdAt: string;
  liveUrl?: string;
  repoUrl?: string;
  progress: number; // 0-100
  activity: ActivityItem[];
}

export type FilterStage = Stage | 'All';
export type FilterHealth = Health | 'All';
export type FilterDeadline = DeadlineState | 'All';
