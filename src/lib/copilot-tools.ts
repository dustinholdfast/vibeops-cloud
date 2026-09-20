import { tool } from 'ai';
import { z } from 'zod';
import { createProject, getProject, listProjects, updateProject, type Scope } from '../db/project-service';
import { ProjectError } from './project-validation';
import {
  copilotActivity,
  describePatch,
  matchProject,
  withCopilotActivity,
  type CopilotPatch,
} from './copilot';
import { generateId } from './utils';
import type { Health, Priority, Stage } from '../types';

const STAGES = ['Exploring', 'Building', 'Testing', 'Live', 'Paused', 'Archived'] as const;
const PRIORITIES = ['Now', 'Next', 'Later'] as const;
const HEALTHS = ['On track', 'At risk', 'Blocked'] as const;

const optionalUrl = z.union([z.string().max(2048), z.null()]).optional();

function asPatch(input: {
  name?: string;
  nextAction?: string;
  stage?: Stage;
  priority?: Priority;
  health?: Health;
  progress?: number;
  targetDate?: string | null;
  liveUrl?: string | null;
  repoUrl?: string | null;
}): CopilotPatch {
  const patch: CopilotPatch = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.nextAction !== undefined) patch.nextAction = input.nextAction;
  if (input.stage !== undefined) patch.stage = input.stage;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.health !== undefined) patch.health = input.health;
  if (input.progress !== undefined) patch.progress = input.progress;
  if (input.targetDate !== undefined) patch.targetDate = input.targetDate;
  if (input.liveUrl !== undefined) patch.liveUrl = input.liveUrl;
  if (input.repoUrl !== undefined) patch.repoUrl = input.repoUrl;
  return patch;
}

function toolError(error: unknown) {
  if (error instanceof ProjectError) {
    return { ok: false as const, error: error.message, code: error.code };
  }
  return { ok: false as const, error: 'Could not update the workspace. Try again.', code: 'SERVICE' };
}

export function copilotTools(scope: Scope) {
  return {
    createProject: tool({
      description: 'Create a project in this workspace.',
      inputSchema: z.object({
        name: z.string().min(1).max(200),
        nextAction: z.string().min(1).max(4000).optional(),
        stage: z.enum(STAGES).optional(),
        priority: z.enum(PRIORITIES).optional(),
        health: z.enum(HEALTHS).optional(),
        progress: z.number().int().min(0).max(100).optional(),
        targetDate: z
          .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()])
          .optional(),
        liveUrl: optionalUrl,
        repoUrl: optionalUrl,
      }),
      execute: async (input) => {
        try {
          const created = await createProject(scope, {
            id: generateId(),
            name: input.name,
            nextAction: input.nextAction,
            stage: input.stage,
            priority: input.priority,
            health: input.health,
            progress: input.progress,
            targetDate: input.targetDate,
            liveUrl: input.liveUrl,
            repoUrl: input.repoUrl,
            activity: [copilotActivity(`Project created: ${input.name}`, 'created')],
          });
          return { ok: true as const, project: created.project, summary: `Created ${created.project.name}` };
        } catch (error) {
          return toolError(error);
        }
      },
    }),
    updateProject: tool({
      description: 'Edit an existing project. Identify it by projectId or exact name.',
      inputSchema: z.object({
        projectId: z.string().min(1).max(128).optional(),
        name: z.string().min(1).max(200).optional(),
        nextAction: z.string().min(1).max(4000).optional(),
        stage: z.enum(STAGES).optional(),
        priority: z.enum(PRIORITIES).optional(),
        health: z.enum(HEALTHS).optional(),
        progress: z.number().int().min(0).max(100).optional(),
        targetDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]).optional(),
        liveUrl: optionalUrl,
        repoUrl: optionalUrl,
      }),
      execute: async (input) => {
        try {
          const listed = await listProjects(scope);
          const current = matchProject(listed.projects, input.projectId, input.name);
          if (!current) {
            return {
              ok: false as const,
              error: 'No matching project. Use the exact name or id from the snapshot.',
              code: 'NOT_FOUND',
            };
          }
          if (!Number.isInteger(current.version) || (current.version as number) < 1) {
            return { ok: false as const, error: 'Reload the workspace before editing.', code: 'VALIDATION' };
          }
          const patch = asPatch(input);
          if (Object.keys(patch).length === 0) {
            return { ok: false as const, error: 'Nothing to change.', code: 'VALIDATION' };
          }
          const summary = describePatch(patch);
          const type =
            patch.stage ? 'stage' : patch.priority ? 'priority' : patch.health ? 'health' : patch.targetDate !== undefined ? 'target' : 'action';
          const updated = await updateProject(scope, current.id, {
            version: current.version,
            mutationId: generateId(),
            ...patch,
            activity: withCopilotActivity(current, `Nox: ${summary}`, type),
          });
          return { ok: true as const, project: updated.project, summary: `${current.name}: ${summary}` };
        } catch (error) {
          return toolError(error);
        }
      },
    }),
    getProject: tool({
      description: 'Read one project by id.',
      inputSchema: z.object({ projectId: z.string().min(1).max(128) }),
      execute: async ({ projectId }) => {
        try {
          const result = await getProject(scope, projectId);
          return { ok: true as const, project: result.project };
        } catch (error) {
          return toolError(error);
        }
      },
    }),
  };
}
