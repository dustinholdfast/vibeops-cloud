import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { requireDb } from './index';
import { projects, subscriptions } from './schema';
import { dbProjectToDomain, domainToDbInsert } from './map';
import { projectTransaction, type Transaction } from './project-transaction';
import { resolvePlan, projectLimitFor } from '../lib/plans';
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
 * lock keyed on the Clerk user id. Plan checks, idempotency lookups and writes
 * therefore see a stable view of one account, so concurrent requests cannot both
 * pass a limit check or both apply the same version.
 */

/** Project ids are globally unique; a collision across tenants must not leak the other row. */
async function assertIdsAvailable(tx: Transaction, userId: string, ids: string[]) {
  if (!ids.length) return;
  const taken = await tx
    .select({ id: projects.id })
    .from(projects)
    .where(and(inArray(projects.id, ids), ne(projects.userId, userId)));
  if (taken.length) {
    throw new ProjectError(
      409,
      'ID_TAKEN',
      'That project identifier is already in use. Retry to save under a new one.'
    );
  }
}

async function planLimit(tx: Transaction, userId: string) {
  const [sub] = await tx
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId));
  return projectLimitFor(resolvePlan(sub?.plan, sub?.status));
}

export async function listProjects(userId: string) {
  const rows = await requireDb()
    .select()
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.lastTouched));
  return { projects: rows.map(dbProjectToDomain) };
}

export async function getProject(userId: string, projectId: string) {
  const id = validateId(projectId);
  const [row] = await requireDb()
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)));
  if (!row) throw new ProjectError(404, 'NOT_FOUND', 'This project is no longer available.');
  return { project: dbProjectToDomain(row) };
}

/**
 * The client supplies the id, so a retried create is recognised by that id and
 * returns the original row instead of inserting a duplicate.
 */
export async function createProject(userId: string, input: unknown) {
  if (!isRecord(input)) throw new ProjectError(400, 'VALIDATION', 'Expected project details.');
  const id = validateId(input.id);
  const fields = validateFields(input);
  if (!fields.name) throw new ProjectError(400, 'VALIDATION', 'Enter a project name.');

  const project = await projectTransaction(userId, async (tx) => {
    const [existing] = await tx
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)));
    if (existing) return dbProjectToDomain(existing);

    await assertIdsAvailable(tx, userId, [id]);

    const limit = await planLimit(tx, userId);
    const owned = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.userId, userId));
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
    const [row] = await tx.insert(projects).values(domainToDbInsert(userId, domain)).returning();
    return dbProjectToDomain(row);
  });

  return { project };
}

/**
 * Replaces the whole workspace in one transaction. The caller sends the versions
 * it believes are current; any drift means someone else wrote in between and the
 * import is refused before anything is deleted.
 */
export async function importProjects(userId: string, input: unknown) {
  const list = validateImport(input);
  if (!isRecord(input) || !isRecord(input.versions)) {
    throw new ProjectError(400, 'VALIDATION', 'Reload your workspace before importing.');
  }
  const versions = input.versions;

  const result = await projectTransaction(userId, async (tx) => {
    const existing = await tx.select().from(projects).where(eq(projects.userId, userId));
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

    await assertIdsAvailable(tx, userId, list.map((p) => p.id));

    const limit = await planLimit(tx, userId);
    if (limit !== null && list.length > limit) {
      throw new ProjectError(
        402,
        'PLAN_LIMIT',
        `Free allows ${limit} projects. Import fewer projects or upgrade to Pro.`
      );
    }

    // Reusing an id keeps its version climbing so other tabs still detect drift.
    const previous = new Map(existing.map((row) => [row.id, row.version]));
    await tx.delete(projects).where(eq(projects.userId, userId));
    if (list.length) {
      await tx.insert(projects).values(
        list.map((p) => ({
          ...domainToDbInsert(userId, p),
          version: (previous.get(p.id) ?? 0) + 1,
        }))
      );
    }

    const rows = await tx
      .select()
      .from(projects)
      .where(eq(projects.userId, userId))
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
export async function updateProject(userId: string, projectId: string, input: unknown) {
  const id = validateId(projectId);
  if (!isRecord(input) || !Number.isInteger(input.version) || (input.version as number) < 1) {
    throw new ProjectError(400, 'VALIDATION', 'Reload the project before saving.');
  }
  const version = input.version as number;
  const mutationId = validateId(input.mutationId);
  const fields = validateFields(input);

  const project = await projectTransaction(userId, async (tx) => {
    const [existing] = await tx
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)));
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
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .returning();
    return dbProjectToDomain(row);
  });

  return { project };
}

/** Idempotent: deleting an already-deleted project succeeds so a retry cannot fail. */
export async function deleteProject(userId: string, projectId: string, input: unknown) {
  const id = validateId(projectId);
  if (!isRecord(input) || !Number.isInteger(input.version) || (input.version as number) < 1) {
    throw new ProjectError(400, 'VALIDATION', 'Reload the project before deleting.');
  }
  const version = input.version as number;

  await projectTransaction(userId, async (tx) => {
    const [existing] = await tx
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)));
    if (!existing) return;
    if (existing.version !== version) {
      throw new ProjectError(
        409,
        'CONFLICT',
        'This project changed elsewhere. Reload it before deleting.'
      );
    }
    await tx.delete(projects).where(and(eq(projects.id, id), eq(projects.userId, userId)));
  });

  return { ok: true };
}
