import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { requireDb } from './index';
import { projectChecks, projectMonitors, projects, subscriptions } from './schema';
import { dbProjectToDomain, domainToDbInsert } from './map';
import { projectTransaction, type Transaction } from './project-transaction';
import { resolvePlan, projectLimitFor } from '../lib/plans';
import { can } from '../lib/workspace-roles';
import type { Membership } from './workspace-service';
import { isRecord } from '../lib/validation';
import {
  ProjectError,
  validateFields,
  validateId,
  validateImport,
} from '../lib/project-validation';
import { generateId } from '../lib/utils';
import type { Project } from '../types';

/**
 * All project mutations run inside `projectTransaction`, which takes an advisory
 * lock keyed on the workspace id. Plan checks, idempotency lookups and writes
 * therefore see a stable view of one workspace, so concurrent requests cannot
 * both pass a limit check or both apply the same version.
 */

/**
 * Who is acting, and in which workspace. Callers build this with
 * `requireMembership`, so reaching a service function already proves the user
 * belongs to the workspace; what remains is what their role permits.
 */
export type Scope = {
  userId: string;
  workspace: Membership;
};

function requireWrite(scope: Scope) {
  if (!can(scope.workspace.role, 'edit:projects')) {
    throw new ProjectError(
      403,
      'FORBIDDEN',
      'You have view-only access to this workspace.'
    );
  }
}

/** Project ids are globally unique; a collision across workspaces must not leak the other row. */
async function assertIdsAvailable(tx: Transaction, workspaceId: string, ids: string[]) {
  if (!ids.length) return;
  const taken = await tx
    .select({ id: projects.id })
    .from(projects)
    .where(and(inArray(projects.id, ids), ne(projects.workspaceId, workspaceId)));
  if (taken.length) {
    throw new ProjectError(
      409,
      'ID_TAKEN',
      'That project identifier is already in use. Retry to save under a new one.'
    );
  }
}

/** A workspace bills on its owner's subscription, not on the member doing the work. */
async function planLimit(tx: Transaction, workspace: Membership) {
  const [sub] = await tx
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, workspace.ownerUserId));
  return projectLimitFor(resolvePlan(sub?.plan, sub?.status));
}

export async function listProjects(scope: Scope) {
  const rows = await requireDb()
    .select()
    .from(projects)
    .where(eq(projects.workspaceId, scope.workspace.workspaceId))
    .orderBy(desc(projects.lastTouched));
  return { projects: rows.map(dbProjectToDomain) };
}

export async function getProject(scope: Scope, projectId: string) {
  const id = validateId(projectId);
  const [row] = await requireDb()
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.workspaceId, scope.workspace.workspaceId)));
  if (!row) throw new ProjectError(404, 'NOT_FOUND', 'This project is no longer available.');
  return { project: dbProjectToDomain(row) };
}

/**
 * The client supplies the id, so a retried create is recognised by that id and
 * returns the original row instead of inserting a duplicate.
 */
export async function createProject(scope: Scope, input: unknown) {
  requireWrite(scope);
  if (!isRecord(input)) throw new ProjectError(400, 'VALIDATION', 'Expected project details.');
  const id = validateId(input.id);
  const fields = validateFields(input);
  if (!fields.name) throw new ProjectError(400, 'VALIDATION', 'Enter a project name.');

  const workspaceId = scope.workspace.workspaceId;

  const project = await projectTransaction(workspaceId, async (tx) => {
    const [existing] = await tx
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.workspaceId, workspaceId)));
    if (existing) return dbProjectToDomain(existing);

    await assertIdsAvailable(tx, workspaceId, [id]);

    const limit = await planLimit(tx, scope.workspace);
    const owned = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.workspaceId, workspaceId));
    if (limit !== null && owned.length >= limit) {
      throw new ProjectError(
        402,
        'PLAN_LIMIT',
        `Free allows ${limit} projects. Upgrade to Pro to add another.`
      );
    }

    const now = new Date().toISOString();
    const domain: Project = {
      nextAction: 'Define the first slice',
      stage: 'Exploring',
      priority: 'Later',
      health: 'On track',
      targetDate: null,
      progress: 0,
      ...fields,
      id,
      name: fields.name!,
      createdAt: now,
      lastTouched: now,
      activity: [
        {
          id: generateId(),
          type: 'created',
          message: 'Project created',
          timestamp: now,
          author: 'You',
        },
      ],
    };
    const [row] = await tx
      .insert(projects)
      .values(domainToDbInsert(workspaceId, scope.userId, domain))
      .returning();
    return dbProjectToDomain(row);
  });

  return { project };
}

/**
 * Removes the monitor and check history belonging to projects that no longer
 * exist.
 *
 * There are no foreign keys in this schema, so nothing removes these rows on
 * its own; without this a deleted project's monitor and its month of history
 * stay forever. Nothing keeps pinging — `dueMonitors` inner-joins `projects`,
 * so a monitor with no project is never due — but the rows accumulate.
 *
 * Guarded by `to_regclass` because the uptime migration is optional: every
 * other entry point treats its absence as "not set up", and deleting a project
 * must not become the one operation that fails without it. `to_regclass`
 * returns null for a missing table rather than raising, which matters inside a
 * transaction, where a raised error would abort the delete as well.
 */
export async function dropMonitoringFor(tx: Transaction, projectIds: string[]) {
  if (projectIds.length === 0) return;

  const present = await tx.execute(
    sql`select to_regclass('public.project_monitors') is not null as present`
  );
  const ready = (present as unknown as { present: boolean }[])[0]?.present;
  if (!ready) return;

  // Checks first: they are the child rows, and the order costs nothing.
  await tx.delete(projectChecks).where(inArray(projectChecks.projectId, projectIds));
  await tx.delete(projectMonitors).where(inArray(projectMonitors.projectId, projectIds));
}

/**
 * Replaces the whole workspace in one transaction. The caller sends the versions
 * it believes are current; any drift means someone else wrote in between and the
 * import is refused before anything is deleted.
 */
export async function importProjects(scope: Scope, input: unknown) {
  requireWrite(scope);
  const list = validateImport(input);
  if (!isRecord(input) || !isRecord(input.versions)) {
    throw new ProjectError(400, 'VALIDATION', 'Reload your workspace before importing.');
  }
  const versions = input.versions;
  const workspaceId = scope.workspace.workspaceId;

  const result = await projectTransaction(workspaceId, async (tx) => {
    const existing = await tx
      .select()
      .from(projects)
      .where(eq(projects.workspaceId, workspaceId));
    const drifted =
      existing.length !== Object.keys(versions).length ||
      existing.some((row) => versions[row.id] !== row.version);
    if (drifted) {
      throw new ProjectError(
        409,
        'CONFLICT',
        'Your workspace changed. Reload and review it before importing again.'
      );
    }

    await assertIdsAvailable(
      tx,
      workspaceId,
      list.map((p) => p.id)
    );

    const limit = await planLimit(tx, scope.workspace);
    if (limit !== null && list.length > limit) {
      throw new ProjectError(
        402,
        'PLAN_LIMIT',
        `Free allows ${limit} projects. Import fewer projects or upgrade to Pro.`
      );
    }

    // Reusing an id keeps its version climbing so other tabs still detect drift.
    const previous = new Map(existing.map((row) => [row.id, row.version]));

    /**
     * Only projects the import actually drops lose their monitoring. An import
     * replaces the whole workspace, but an export keeps ids, so re-importing
     * one is the same project arriving again — wiping its monitor and its
     * month of history would be a surprising cost for a round trip through a
     * JSON file.
     */
    const keeping = new Set(list.map((p) => p.id));
    await dropMonitoringFor(
      tx,
      existing.map((row) => row.id).filter((id) => !keeping.has(id))
    );

    await tx.delete(projects).where(eq(projects.workspaceId, workspaceId));
    if (list.length) {
      await tx.insert(projects).values(
        list.map((p) => ({
          ...domainToDbInsert(workspaceId, scope.userId, p),
          version: (previous.get(p.id) ?? 0) + 1,
        }))
      );
    }

    const rows = await tx
      .select()
      .from(projects)
      .where(eq(projects.workspaceId, workspaceId))
      .orderBy(desc(projects.lastTouched));
    return rows.map(dbProjectToDomain);
  });

  return { projects: result };
}

/**
 * Optimistic concurrency: the caller must send the version it edited. A repeated
 * mutation id means the previous attempt already landed, so the stored row is
 * returned unchanged rather than applied twice.
 */
export async function updateProject(scope: Scope, projectId: string, input: unknown) {
  requireWrite(scope);
  const id = validateId(projectId);
  if (!isRecord(input) || !Number.isInteger(input.version) || (input.version as number) < 1) {
    throw new ProjectError(400, 'VALIDATION', 'Reload the project before saving.');
  }
  const version = input.version as number;
  const mutationId = validateId(input.mutationId);
  const fields = validateFields(input);
  const workspaceId = scope.workspace.workspaceId;

  const project = await projectTransaction(workspaceId, async (tx) => {
    const [existing] = await tx
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.workspaceId, workspaceId)));
    if (!existing) throw new ProjectError(404, 'NOT_FOUND', 'This project is no longer available.');
    if (existing.lastMutationId === mutationId) return dbProjectToDomain(existing);
    if (existing.version !== version) {
      throw new ProjectError(
        409,
        'CONFLICT',
        'This project changed elsewhere. Review the latest saved version before retrying.'
      );
    }

    const now = new Date();
    const [row] = await tx
      .update(projects)
      .set({
        ...fields,
        updatedAt: now,
        lastTouched: now,
        version: existing.version + 1,
        lastMutationId: mutationId,
      })
      .where(and(eq(projects.id, id), eq(projects.workspaceId, workspaceId)))
      .returning();
    return dbProjectToDomain(row);
  });

  return { project };
}

/** Idempotent: deleting an already-deleted project succeeds so a retry cannot fail. */
export async function deleteProject(scope: Scope, projectId: string, input: unknown) {
  requireWrite(scope);
  const id = validateId(projectId);
  if (!isRecord(input) || !Number.isInteger(input.version) || (input.version as number) < 1) {
    throw new ProjectError(400, 'VALIDATION', 'Reload the project before deleting.');
  }
  const version = input.version as number;
  const workspaceId = scope.workspace.workspaceId;

  await projectTransaction(workspaceId, async (tx) => {
    const [existing] = await tx
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.workspaceId, workspaceId)));
    if (!existing) return;
    if (existing.version !== version) {
      throw new ProjectError(
        409,
        'CONFLICT',
        'This project changed elsewhere. Reload it before deleting.'
      );
    }
    await tx.delete(projects).where(and(eq(projects.id, id), eq(projects.workspaceId, workspaceId)));
    await dropMonitoringFor(tx, [id]);
  });

  return { ok: true };
}
