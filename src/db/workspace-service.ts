import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { requireDb } from './index';
import { dropMonitoringFor } from './project-service';
import { projects, workspaceInvites, workspaceMembers, workspaces } from './schema';
import { ProjectError, validateId } from '../lib/project-validation';
import {
  can,
  canAssignRole,
  canInvite,
  canRemoveMember,
  isWorkspaceRole,
  type WorkspaceCapability,
  type WorkspaceRole,
} from '../lib/workspace-roles';
import type { Transaction } from './project-transaction';

export const INVITE_TTL_DAYS = 14;
const MAX_WORKSPACE_NAME = 60;

export type Membership = {
  workspaceId: string;
  role: WorkspaceRole;
  name: string;
  personal: boolean;
  ownerUserId: string;
};

export type MemberSummary = {
  userId: string;
  role: WorkspaceRole;
  joinedAt: string;
};

export type InviteSummary = {
  id: string;
  email: string;
  role: WorkspaceRole;
  expiresAt: string;
  createdAt: string;
};

function forbidden(message: string): never {
  throw new ProjectError(403, 'FORBIDDEN', message);
}

export function validateWorkspaceName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) throw new ProjectError(400, 'VALIDATION', 'Enter a workspace name.');
  if (name.length > MAX_WORKSPACE_NAME) {
    throw new ProjectError(
      400,
      'VALIDATION',
      `Workspace names are at most ${MAX_WORKSPACE_NAME} characters.`
    );
  }
  return name;
}

/** Stored and compared lowercase so an invite matches however the address was typed. */
export function validateEmail(value: unknown): string {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ProjectError(400, 'VALIDATION', 'Enter a valid email address.');
  }
  return email;
}

export function validateRole(value: unknown): WorkspaceRole {
  if (!isWorkspaceRole(value)) {
    throw new ProjectError(400, 'VALIDATION', 'Choose a valid role.');
  }
  return value;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Web Crypto only, so this behaves the same on Node and on Workers. */
function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return toHex(new Uint8Array(digest));
}

function generateId(prefix: string): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return prefix + toHex(bytes);
}

/**
 * Serialises membership changes for one workspace, in the same style as
 * `projectTransaction`. Role edits and invite redemption both read then write,
 * so they must not interleave.
 */
function workspaceTransaction<T>(workspaceId: string, operation: (tx: Transaction) => Promise<T>) {
  return requireDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${workspaceId}, 0))`);
    return operation(tx);
  });
}

function toMembership(row: {
  workspaceId: string;
  name: string;
  personal: number;
  ownerUserId: string;
  role: string;
}): Membership {
  return {
    workspaceId: row.workspaceId,
    name: row.name,
    personal: row.personal === 1,
    ownerUserId: row.ownerUserId,
    role: isWorkspaceRole(row.role) ? row.role : 'viewer',
  };
}

function personalMembership(userId: string): Membership {
  return {
    workspaceId: userId,
    role: 'owner',
    name: 'Personal',
    personal: true,
    ownerUserId: userId,
  };
}

/**
 * Every user has a personal workspace whose id is their Clerk user id. The row
 * is created on demand so accounts that predate workspaces get one, and so a
 * new account has something to list.
 */
export async function ensurePersonalWorkspace(userId: string): Promise<Membership> {
  const db = requireDb();
  const now = new Date();

  await db
    .insert(workspaces)
    .values({
      id: userId,
      name: 'Personal',
      ownerUserId: userId,
      personal: 1,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  await db
    .insert(workspaceMembers)
    .values({ workspaceId: userId, userId, role: 'owner', createdAt: now, updatedAt: now })
    .onConflictDoNothing();

  return personalMembership(userId);
}

/** Every workspace the user belongs to, personal first, then by name. */
export async function listWorkspaces(userId: string): Promise<Membership[]> {
  await ensurePersonalWorkspace(userId);

  const rows = await requireDb()
    .select({
      workspaceId: workspaces.id,
      name: workspaces.name,
      personal: workspaces.personal,
      ownerUserId: workspaces.ownerUserId,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId));

  return rows
    .map(toMembership)
    .sort((a, b) => Number(b.personal) - Number(a.personal) || a.name.localeCompare(b.name));
}

/**
 * Resolves the workspace a request should act on and proves the user belongs to
 * it. An unknown id and one the user cannot see are reported identically, so
 * workspace ids cannot be probed for existence.
 */
export async function requireMembership(
  userId: string,
  workspaceId?: string | null
): Promise<Membership> {
  // The personal workspace needs no lookup: its id is the user id, and the user
  // is always its owner. Creating the row is left to listWorkspaces, so the
  // common request path costs no extra writes.
  if (!workspaceId || workspaceId === userId) return personalMembership(userId);

  const [row] = await requireDb()
    .select({
      workspaceId: workspaces.id,
      name: workspaces.name,
      personal: workspaces.personal,
      ownerUserId: workspaces.ownerUserId,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(
      and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, workspaceId))
    );

  if (!row) throw new ProjectError(404, 'NOT_FOUND', 'That workspace is not available.');

  return toMembership(row);
}

/** Membership plus a capability check, for routes that mutate. */
export async function requireCapability(
  userId: string,
  workspaceId: string | null | undefined,
  capability: WorkspaceCapability,
  message: string
): Promise<Membership> {
  const membership = await requireMembership(userId, workspaceId);
  if (!can(membership.role, capability)) forbidden(message);
  return membership;
}

export async function createWorkspace(userId: string, input: unknown) {
  const name = validateWorkspaceName((input as { name?: unknown })?.name);
  const now = new Date();
  const id = generateId('ws_');

  await requireDb().transaction(async (tx) => {
    await tx.insert(workspaces).values({
      id,
      name,
      ownerUserId: userId,
      personal: 0,
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(workspaceMembers).values({
      workspaceId: id,
      userId,
      role: 'owner',
      createdAt: now,
      updatedAt: now,
    });
  });

  const workspace: Membership = {
    workspaceId: id,
    name,
    personal: false,
    ownerUserId: userId,
    role: 'owner',
  };
  return { workspace };
}

export async function renameWorkspace(userId: string, workspaceId: string, input: unknown) {
  const membership = await requireCapability(
    userId,
    workspaceId,
    'manage:workspace',
    'Only the workspace owner can rename it.'
  );
  const name = validateWorkspaceName((input as { name?: unknown })?.name);

  await requireDb()
    .update(workspaces)
    .set({ name, updatedAt: new Date() })
    .where(eq(workspaces.id, membership.workspaceId));

  return { workspace: { ...membership, name } };
}

/**
 * Deletes a workspace and everything scoped to it. Personal workspaces are not
 * deletable: they are where a user's own projects live.
 */
export async function deleteWorkspace(userId: string, workspaceId: string) {
  const membership = await requireCapability(
    userId,
    workspaceId,
    'manage:workspace',
    'Only the workspace owner can delete it.'
  );
  if (membership.personal) {
    throw new ProjectError(400, 'VALIDATION', 'A personal workspace cannot be deleted.');
  }

  const id = membership.workspaceId;
  await workspaceTransaction(id, async (tx) => {
    // Every project here is going, so its monitoring goes with it. Nothing
    // else would ever remove these rows: the schema has no foreign keys.
    const doomed = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.workspaceId, id));
    await dropMonitoringFor(
      tx,
      doomed.map((row) => row.id)
    );

    await tx.delete(projects).where(eq(projects.workspaceId, id));
    await tx.delete(workspaceInvites).where(eq(workspaceInvites.workspaceId, id));
    await tx.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, id));
    await tx.delete(workspaces).where(eq(workspaces.id, id));
  });

  return { ok: true };
}

export async function listMembers(userId: string, workspaceId: string) {
  const membership = await requireMembership(userId, workspaceId);

  const rows = await requireDb()
    .select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, membership.workspaceId))
    .orderBy(asc(workspaceMembers.createdAt));

  const members: MemberSummary[] = rows.map((row) => ({
    userId: row.userId,
    role: isWorkspaceRole(row.role) ? row.role : 'viewer',
    joinedAt: row.createdAt.toISOString(),
  }));

  return { workspace: membership, members };
}

export async function updateMemberRole(
  userId: string,
  workspaceId: string,
  targetUserId: string,
  input: unknown
) {
  const role = validateRole((input as { role?: unknown })?.role);
  const membership = await requireMembership(userId, workspaceId);
  const id = membership.workspaceId;

  return workspaceTransaction(id, async (tx) => {
    const [target] = await tx
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, id), eq(workspaceMembers.userId, targetUserId)));
    if (!target) throw new ProjectError(404, 'NOT_FOUND', 'That person is not in this workspace.');

    const check = canAssignRole(
      { userId, role: membership.role },
      { userId: targetUserId, role: isWorkspaceRole(target.role) ? target.role : 'viewer' },
      role
    );
    if (!check.ok) forbidden(check.reason);

    await tx
      .update(workspaceMembers)
      .set({ role, updatedAt: new Date() })
      .where(and(eq(workspaceMembers.workspaceId, id), eq(workspaceMembers.userId, targetUserId)));

    return { member: { userId: targetUserId, role } };
  });
}

/** Idempotent: removing someone who has already left succeeds. */
export async function removeMember(userId: string, workspaceId: string, targetUserId: string) {
  const membership = await requireMembership(userId, workspaceId);
  const id = membership.workspaceId;

  return workspaceTransaction(id, async (tx) => {
    const [target] = await tx
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, id), eq(workspaceMembers.userId, targetUserId)));
    if (!target) return { ok: true };

    const check = canRemoveMember(
      { userId, role: membership.role },
      { userId: targetUserId, role: isWorkspaceRole(target.role) ? target.role : 'viewer' }
    );
    if (!check.ok) forbidden(check.reason);

    await tx
      .delete(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, id), eq(workspaceMembers.userId, targetUserId)));

    return { ok: true };
  });
}

/**
 * Creates an invitation and returns the raw token exactly once. Only its hash is
 * stored, so the link cannot be recovered from the database afterwards.
 */
export async function createInvite(userId: string, workspaceId: string, input: unknown) {
  const body = (input ?? {}) as { email?: unknown; role?: unknown };
  const email = validateEmail(body.email);
  const role = body.role === undefined ? 'member' : validateRole(body.role);
  const membership = await requireMembership(userId, workspaceId);

  const check = canInvite(membership.role, role);
  if (!check.ok) forbidden(check.reason);

  if (membership.personal) {
    throw new ProjectError(400, 'VALIDATION', 'Create a team workspace before inviting people.');
  }

  const token = randomToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  const id = generateId('inv_');

  await requireDb().insert(workspaceInvites).values({
    id,
    workspaceId: membership.workspaceId,
    email,
    role,
    tokenHash: await hashToken(token),
    invitedByUserId: userId,
    expiresAt,
    createdAt: now,
  });

  const invite: InviteSummary = {
    id,
    email,
    role,
    expiresAt: expiresAt.toISOString(),
    createdAt: now.toISOString(),
  };
  return { invite, token };
}

export async function listInvites(userId: string, workspaceId: string) {
  const membership = await requireCapability(
    userId,
    workspaceId,
    'manage:members',
    'You do not have permission to view invitations.'
  );

  const rows = await requireDb()
    .select()
    .from(workspaceInvites)
    .where(
      and(
        eq(workspaceInvites.workspaceId, membership.workspaceId),
        isNull(workspaceInvites.acceptedAt)
      )
    )
    .orderBy(asc(workspaceInvites.createdAt));

  const invites: InviteSummary[] = rows.map((row) => ({
    id: row.id,
    email: row.email,
    role: isWorkspaceRole(row.role) ? row.role : 'viewer',
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  }));

  return { invites };
}

export async function revokeInvite(userId: string, workspaceId: string, inviteId: string) {
  const membership = await requireCapability(
    userId,
    workspaceId,
    'manage:members',
    'You do not have permission to revoke invitations.'
  );

  await requireDb()
    .delete(workspaceInvites)
    .where(
      and(
        eq(workspaceInvites.id, validateId(inviteId)),
        eq(workspaceInvites.workspaceId, membership.workspaceId)
      )
    );

  return { ok: true };
}

/**
 * Redeems an invitation. The token is matched by hash and the address must be
 * one the signed-in account actually owns, so a forwarded link cannot be used by
 * someone it was not sent to.
 */
export async function acceptInvite(userId: string, userEmails: string[], input: unknown) {
  const token = (input as { token?: unknown })?.token;
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
    throw new ProjectError(400, 'VALIDATION', 'That invitation link is not valid.');
  }
  const tokenHash = await hashToken(token);
  const owned = new Set(userEmails.map((email) => email.trim().toLowerCase()));

  const [invite] = await requireDb()
    .select()
    .from(workspaceInvites)
    .where(eq(workspaceInvites.tokenHash, tokenHash));

  if (!invite || invite.acceptedAt) {
    throw new ProjectError(404, 'NOT_FOUND', 'That invitation has already been used or withdrawn.');
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    throw new ProjectError(410, 'EXPIRED', 'That invitation has expired. Ask for a new one.');
  }
  if (!owned.has(invite.email)) {
    forbidden('This invitation was sent to a different email address.');
  }

  const role = isWorkspaceRole(invite.role) ? invite.role : 'member';

  return workspaceTransaction(invite.workspaceId, async (tx) => {
    const now = new Date();
    await tx
      .insert(workspaceMembers)
      .values({ workspaceId: invite.workspaceId, userId, role, createdAt: now, updatedAt: now })
      .onConflictDoNothing();

    // Single-use: redeemed inside the same lock that added the member.
    await tx
      .update(workspaceInvites)
      .set({ acceptedAt: now, acceptedByUserId: userId })
      .where(and(eq(workspaceInvites.id, invite.id), isNull(workspaceInvites.acceptedAt)));

    const [workspace] = await tx
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, invite.workspaceId));

    const membership: Membership = {
      workspaceId: invite.workspaceId,
      name: workspace?.name ?? 'Workspace',
      personal: false,
      ownerUserId: workspace?.ownerUserId ?? '',
      role,
    };
    return { workspace: membership };
  });
}
