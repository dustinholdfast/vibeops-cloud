import type { WorkspaceRole } from '../lib/workspace-roles';

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
  version?: number;
  id: string;
  name: string;
  nextAction: string;
  stage: Stage;
  priority: Priority;
  health: Health;
  targetDate: string | null; // YYYY-MM-DD (local calendar date)
  lastTouched: string; // ISO datetime
  createdAt: string;
  liveUrl?: string | null;
  repoUrl?: string | null;
  progress: number; // 0-100
  activity: ActivityItem[];
}

export type FilterStage = Stage | 'All';
export type FilterHealth = Health | 'All';
export type FilterDeadline = DeadlineState | 'All';

export type { WorkspaceRole };

/** A workspace as the client sees it: identity plus the viewer's own role. */
export interface Workspace {
  workspaceId: string;
  name: string;
  personal: boolean;
  ownerUserId: string;
  role: WorkspaceRole;
}

export interface WorkspaceMember {
  userId: string;
  role: WorkspaceRole;
  joinedAt: string;
  /** Resolved from Clerk for display; absent if the lookup was unavailable. */
  name?: string;
  email?: string;
}

export interface WorkspaceInvite {
  id: string;
  email: string;
  role: WorkspaceRole;
  expiresAt: string;
  createdAt: string;
}

// --- Uptime monitoring ----------------------------------------------------

export type MonitorStatus = 'unknown' | 'up' | 'down';

export type UptimeMonitor = {
  projectId: string;
  url: string;
  enabled: boolean;
  intervalSeconds: number;
  failureThreshold: number;
  status: MonitorStatus;
  lastCheckedAt: string | null;
  lastStatusChangeAt: string | null;
  lastError: string | null;
};

export type UptimeWindow = {
  checks: number;
  failures: number;
  /** Null when nothing has been checked in the window — not the same as 0%. */
  uptimePct: number | null;
  avgLatencyMs: number | null;
};

export type UptimeBucket = {
  start: string;
  end: string;
  total: number;
  failed: number;
  state: 'none' | 'up' | 'degraded' | 'down';
};

export type UptimeCheck = {
  checkedAt: string;
  ok: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  error: string | null;
};

export type UptimeSnapshot = {
  /** False when the monitoring migration has not been applied. */
  available: boolean;
  monitor: UptimeMonitor | null;
  windows?: { day: UptimeWindow; week: UptimeWindow; month: UptimeWindow };
  buckets?: UptimeBucket[];
  streakMs?: number | null;
  recent?: UptimeCheck[];
};

/** The immediate answer from a manual "check now". */
export type UptimeCheckResult = {
  available: boolean;
  checkedAt?: string;
  ok?: boolean;
  statusCode?: number | null;
  latencyMs?: number | null;
  error?: string | null;
  status?: MonitorStatus;
  alert?: 'up' | 'down' | null;
  /** How many people were emailed, when this check flipped the state. */
  notified?: number;
};
