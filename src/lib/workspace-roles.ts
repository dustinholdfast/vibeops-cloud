/**
 * Workspace roles and what each one may do. Kept free of database and request
 * concerns so the rules can be read — and tested — in one place.
 */

export const WORKSPACE_ROLES = ['owner', 'admin', 'member', 'viewer'] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export type WorkspaceCapability =
  | 'view:projects'
  | 'edit:projects'
  | 'manage:members'
  | 'manage:workspace'
  | 'manage:billing';

/** Higher outranks lower. Used to stop anyone editing a peer at or above them. */
const RANK: Record<WorkspaceRole, number> = {
  owner: 3,
  admin: 2,
  member: 1,
  viewer: 0,
};

const CAPABILITIES: Record<WorkspaceRole, ReadonlySet<WorkspaceCapability>> = {
  owner: new Set([
    'view:projects',
    'edit:projects',
    'manage:members',
    'manage:workspace',
    'manage:billing',
  ]),
  admin: new Set(['view:projects', 'edit:projects', 'manage:members']),
  member: new Set(['view:projects', 'edit:projects']),
  viewer: new Set(['view:projects']),
};

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return typeof value === 'string' && (WORKSPACE_ROLES as readonly string[]).includes(value);
}

export function can(role: WorkspaceRole, capability: WorkspaceCapability): boolean {
  return CAPABILITIES[role].has(capability);
}

export function outranks(actor: WorkspaceRole, subject: WorkspaceRole): boolean {
  return RANK[actor] > RANK[subject];
}

export type RoleChangeCheck =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Whether `actor` may set `subject`'s role to `next`.
 *
 * Ownership is deliberately not grantable here: there is exactly one owner and
 * moving it is a transfer, which reassigns the previous owner at the same time.
 */
export function canAssignRole(
  actor: { userId: string; role: WorkspaceRole },
  subject: { userId: string; role: WorkspaceRole },
  next: WorkspaceRole
): RoleChangeCheck {
  if (!can(actor.role, 'manage:members')) {
    return { ok: false, reason: 'You do not have permission to manage members.' };
  }
  if (actor.userId === subject.userId) {
    return { ok: false, reason: 'You cannot change your own role.' };
  }
  if (next === 'owner') {
    return { ok: false, reason: 'Use ownership transfer to change the workspace owner.' };
  }
  if (subject.role === 'owner') {
    return { ok: false, reason: 'The workspace owner’s role cannot be changed.' };
  }
  if (!outranks(actor.role, subject.role)) {
    return { ok: false, reason: 'You cannot change the role of someone at your own level.' };
  }
  if (!outranks(actor.role, next) && actor.role !== next) {
    return { ok: false, reason: 'You cannot grant a role above your own.' };
  }
  return { ok: true };
}

/** Whether `actor` may remove `subject` from the workspace. */
export function canRemoveMember(
  actor: { userId: string; role: WorkspaceRole },
  subject: { userId: string; role: WorkspaceRole }
): RoleChangeCheck {
  if (actor.userId === subject.userId) {
    // Leaving is a separate, always-allowed action for everyone but the owner.
    return subject.role === 'owner'
      ? { ok: false, reason: 'Transfer ownership before leaving the workspace.' }
      : { ok: true };
  }
  if (!can(actor.role, 'manage:members')) {
    return { ok: false, reason: 'You do not have permission to manage members.' };
  }
  if (subject.role === 'owner') {
    return { ok: false, reason: 'The workspace owner cannot be removed.' };
  }
  if (!outranks(actor.role, subject.role)) {
    return { ok: false, reason: 'You cannot remove someone at your own level.' };
  }
  return { ok: true };
}

/** Whether `actor` may invite someone at `role`. */
export function canInvite(actor: WorkspaceRole, role: WorkspaceRole): RoleChangeCheck {
  if (!can(actor, 'manage:members')) {
    return { ok: false, reason: 'You do not have permission to invite people.' };
  }
  if (role === 'owner') {
    return { ok: false, reason: 'A workspace has exactly one owner.' };
  }
  if (!outranks(actor, role) && actor !== role) {
    return { ok: false, reason: 'You cannot invite someone above your own role.' };
  }
  return { ok: true };
}
