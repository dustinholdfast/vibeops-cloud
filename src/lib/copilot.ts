import type { Health, Priority, Project, Stage } from '../types';
import { MAX_ACTIVITY_ENTRIES } from './project-validation';
import { generateId } from './utils';

export const COPILOT_AUTHOR = 'Noxen';
export const COPILOT_MODEL = 'glm-5.2';
export const COPILOT_KEY_ENV = 'ZAI_API_KEY';
/** GLM Coding Plan keys use this host; pay-as-you-go keys use /api/paas/v4. */
export const COPILOT_BASE_URL = 'https://api.z.ai/api/coding/paas/v4';
const SNAPSHOT_LIMIT = 50;

export type CopilotProject = {
  id: string;
  name: string;
  nextAction: string;
  stage: Stage;
  priority: Priority;
  health: Health;
  progress: number;
  targetDate: string | null;
  liveUrl: string | null;
  repoUrl: string | null;
  lastTouched: string;
};

export type CopilotPatch = {
  name?: string;
  nextAction?: string;
  stage?: Stage;
  priority?: Priority;
  health?: Health;
  progress?: number;
  targetDate?: string | null;
  liveUrl?: string | null;
  repoUrl?: string | null;
};

export function compactProject(project: Project): CopilotProject {
  return {
    id: project.id,
    name: project.name,
    nextAction: project.nextAction,
    stage: project.stage,
    priority: project.priority,
    health: project.health,
    progress: project.progress,
    targetDate: project.targetDate,
    liveUrl: project.liveUrl ?? null,
    repoUrl: project.repoUrl ?? null,
    lastTouched: project.lastTouched,
  };
}

export function compactWorkspace(projects: Project[]): CopilotProject[] {
  return projects.slice(0, SNAPSHOT_LIMIT).map(compactProject);
}

export function matchProject(
  projects: Project[],
  projectId?: string,
  name?: string
): Project | undefined {
  if (projectId) {
    const exact = projects.find((project) => project.id === projectId);
    if (exact) return exact;
  }
  const needle = name?.trim().toLowerCase();
  if (!needle) return undefined;
  const matches = projects.filter((project) => project.name.toLowerCase() === needle);
  if (matches.length === 1) return matches[0];
  const partial = projects.filter((project) => project.name.toLowerCase().includes(needle));
  return partial.length === 1 ? partial[0] : undefined;
}

export function describePatch(patch: CopilotPatch): string {
  const bits: string[] = [];
  if (patch.name) bits.push(`renamed to ${patch.name}`);
  if (patch.stage) bits.push(`stage ${patch.stage}`);
  if (patch.priority) bits.push(`priority ${patch.priority}`);
  if (patch.health) bits.push(`health ${patch.health}`);
  if (patch.nextAction) bits.push(`next action: ${patch.nextAction.slice(0, 80)}`);
  if (patch.progress !== undefined) bits.push(`progress ${patch.progress}%`);
  if (patch.targetDate !== undefined) {
    bits.push(patch.targetDate ? `target ${patch.targetDate}` : 'target cleared');
  }
  if (patch.liveUrl !== undefined) bits.push(patch.liveUrl ? 'live URL updated' : 'live URL cleared');
  if (patch.repoUrl !== undefined) bits.push(patch.repoUrl ? 'repo URL updated' : 'repo URL cleared');
  return bits.length ? bits.join(', ') : 'updated';
}

export function copilotActivity(message: string, type: Project['activity'][number]['type'] = 'action') {
  return {
    id: generateId(),
    type,
    message,
    timestamp: new Date().toISOString(),
    author: COPILOT_AUTHOR,
  };
}

export function withCopilotActivity(project: Project, message: string, type: Project['activity'][number]['type'] = 'action') {
  return [copilotActivity(message, type), ...project.activity].slice(0, MAX_ACTIVITY_ENTRIES);
}

/** Safe text for the chat UI. Never include secrets. */
export function copilotClientError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'The copilot could not answer.';
  const cleaned = raw.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').replace(/sk-[A-Za-z0-9._-]+/g, '[redacted]');
  if (/unauthoriz|invalid api key|incorrect api key|401/i.test(cleaned)) {
    return 'Z.ai rejected the API key. Coding Plan keys need the coding endpoint; pay-as-you-go keys need https://api.z.ai/api/paas/v4.';
  }
  if (/404|not found|no such model/i.test(cleaned)) {
    return 'Z.ai does not have that model on this key. Try glm-5.2 or set ZAI_BASE_URL for the matching API.';
  }
  if (/429|rate limit|quota|credit/i.test(cleaned)) {
    return 'Z.ai rate-limited the request. Wait a moment and try again.';
  }
  return cleaned.slice(0, 400) || 'The copilot could not answer.';
}

export function copilotSystemPrompt(workspaceName: string, projects: CopilotProject[]): string {
  return [
    'You are the Noxen Cloud copilot for this workspace.',
    `Workspace: ${workspaceName}.`,
    'Answer from the workspace snapshot. Use tools to create or edit projects; do not claim you changed something unless a tool succeeded.',
    'Never delete projects. Never invent ids. Match an existing project by id or exact name before updating.',
    'Stage must be one of Exploring, Building, Testing, Live, Paused, Archived.',
    'Priority must be Now, Next, or Later. Health must be On track, At risk, or Blocked.',
    'Be concise. After a successful edit, say what changed in one or two sentences.',
    'Current projects JSON:',
    JSON.stringify(projects),
  ].join('\n');
}
