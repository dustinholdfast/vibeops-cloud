import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  can,
  canAssignRole,
  canInvite,
  canRemoveMember,
  isWorkspaceRole,
  outranks,
} from './workspace-roles';

const owner = { userId: 'u-owner', role: 'owner' as const };
const admin = { userId: 'u-admin', role: 'admin' as const };
const other = { userId: 'u-admin-2', role: 'admin' as const };
const member = { userId: 'u-member', role: 'member' as const };
const viewer = { userId: 'u-viewer', role: 'viewer' as const };

describe('workspace capabilities', () => {
  it('lets every role read and stops a viewer writing', () => {
    for (const role of ['owner', 'admin', 'member', 'viewer'] as const) {
      assert.equal(can(role, 'view:projects'), true);
    }
    assert.equal(can('viewer', 'edit:projects'), false);
    assert.equal(can('member', 'edit:projects'), true);
  });

  it('keeps billing and workspace settings with the owner alone', () => {
    assert.equal(can('owner', 'manage:billing'), true);
    assert.equal(can('admin', 'manage:billing'), false);
    assert.equal(can('admin', 'manage:workspace'), false);
    assert.equal(can('admin', 'manage:members'), true);
    assert.equal(can('member', 'manage:members'), false);
  });

  it('ranks roles', () => {
    assert.equal(outranks('owner', 'admin'), true);
    assert.equal(outranks('admin', 'admin'), false);
    assert.equal(outranks('viewer', 'member'), false);
  });

  it('validates role strings', () => {
    assert.equal(isWorkspaceRole('admin'), true);
    assert.equal(isWorkspaceRole('root'), false);
    assert.equal(isWorkspaceRole(2), false);
  });
});

describe('assigning roles', () => {
  it('lets an admin promote a member and demote to viewer', () => {
    assert.deepEqual(canAssignRole(admin, member, 'admin'), { ok: true });
    assert.deepEqual(canAssignRole(admin, member, 'viewer'), { ok: true });
  });

  it('refuses to grant ownership', () => {
    const result = canAssignRole(owner, member, 'owner');
    assert.equal(result.ok, false);
  });

  it('refuses to change the owner’s role or your own', () => {
    assert.equal(canAssignRole(admin, owner, 'member').ok, false);
    assert.equal(canAssignRole(admin, admin, 'member').ok, false);
  });

  it('refuses to touch a peer at the same level', () => {
    assert.equal(canAssignRole(admin, other, 'member').ok, false);
  });

  it('refuses a member who has no member management at all', () => {
    assert.equal(canAssignRole(member, viewer, 'admin').ok, false);
  });
});

describe('removing members', () => {
  it('lets an admin remove a member but not a peer or the owner', () => {
    assert.deepEqual(canRemoveMember(admin, member), { ok: true });
    assert.equal(canRemoveMember(admin, other).ok, false);
    assert.equal(canRemoveMember(admin, owner).ok, false);
  });

  it('lets anyone but the owner leave', () => {
    assert.deepEqual(canRemoveMember(viewer, viewer), { ok: true });
    assert.equal(canRemoveMember(owner, owner).ok, false);
  });
});

describe('inviting', () => {
  it('lets an admin invite at or below their own level', () => {
    assert.deepEqual(canInvite('admin', 'admin'), { ok: true });
    assert.deepEqual(canInvite('admin', 'member'), { ok: true });
    assert.equal(canInvite('admin', 'owner').ok, false);
  });

  it('refuses members and viewers', () => {
    assert.equal(canInvite('member', 'viewer').ok, false);
    assert.equal(canInvite('viewer', 'viewer').ok, false);
  });
});
