'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Loader2, Trash2, X } from 'lucide-react';
import {
  apiCreateInvite,
  apiDeleteWorkspace,
  apiListInvites,
  apiListMembers,
  apiRemoveMember,
  apiRevokeInvite,
  apiUpdateMemberRole,
  setActiveWorkspace,
} from '../lib/api';
import { can, canAssignRole, canRemoveMember, WORKSPACE_ROLES } from '../lib/workspace-roles';
import { useProjectStore } from '../store/useProjectStore';
import type { Workspace, WorkspaceInvite, WorkspaceMember, WorkspaceRole } from '../types';

const ASSIGNABLE = WORKSPACE_ROLES.filter((role) => role !== 'owner');

type Props = {
  workspace: Workspace;
  onClose: () => void;
};

export function WorkspaceMembers({ workspace, onClose }: Props) {
  const currentUserId = useProjectStore((s) => s.userId);
  const loadWorkspaces = useProjectStore((s) => s.loadWorkspaces);
  const loadProjects = useProjectStore((s) => s.loadProjects);
  const drafts = useProjectStore((s) => s.drafts);
  const creation = useProjectStore((s) => s.creation);
  const creating = useProjectStore((s) => s.creating);
  const operationBusy = useProjectStore((s) => s.operationBusy);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<WorkspaceRole>('member');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const id = workspace.workspaceId;
  const canDeleteWorkspace = !workspace.personal && can(workspace.role, 'manage:workspace');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [memberList, inviteList] = await Promise.all([
        apiListMembers(id),
        apiListInvites(id),
      ]);
      setMembers(memberList.members);
      setInvites(inviteList);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load this workspace.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  const sendInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const created = await apiCreateInvite(id, email.trim(), role);
      setInviteUrl(created.inviteUrl);
      setEmail('');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create that invitation.');
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    if (!currentUserId) return;
    setBusy(true);
    setError(null);
    try {
      await apiRemoveMember(id, currentUserId);
      setActiveWorkspace(null);
      await loadWorkspaces();
      await loadProjects();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not leave this workspace.');
      setBusy(false);
    }
  };

  const destroy = async () => {
    if (!canDeleteWorkspace) return;
    if (creating || operationBusy || creation || Object.keys(drafts).length) {
      setError('Save or discard pending changes before deleting this workspace.');
      return;
    }
    const ok = window.confirm(
      `Delete “${workspace.name}”? All projects in this workspace will be permanently removed. This cannot be undone.`
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await apiDeleteWorkspace(id);
      setActiveWorkspace(null);
      await loadWorkspaces();
      await loadProjects();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete that workspace.');
      setBusy(false);
    }
  };

  const actor = { userId: currentUserId ?? '', role: workspace.role };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="members-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-text-dim">Workspace</p>
            <h2 id="members-title" className="text-base font-semibold text-text">
              People in {workspace.name}
            </h2>
            <p className="mt-0.5 text-xs text-text-dim">Members can edit projects. Viewers can only read them.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-text-dim hover:text-text">
            <X size={18} aria-hidden />
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <form onSubmit={sendInvite} className="mt-4 flex flex-wrap gap-2">
          <label htmlFor="invite-email" className="sr-only">Email address</label>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="teammate@example.com"
            className="min-w-[200px] flex-1 rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-purple/50 focus:outline-none"
          />
          <label htmlFor="invite-role" className="sr-only">Role</label>
          <select
            id="invite-role"
            value={role}
            onChange={(event) => setRole(event.target.value as WorkspaceRole)}
            className="rounded-lg border border-border bg-surface-elevated px-2 py-2 text-sm capitalize text-text focus:border-purple/50 focus:outline-none"
          >
            {ASSIGNABLE.map((option) => (
              <option key={option} value={option} className="capitalize">
                {option}
              </option>
            ))}
          </select>
          <button type="submit" disabled={busy || !email.trim()} className="rounded-lg bg-purple px-3 py-2 text-sm font-medium text-white hover:bg-purple-light disabled:opacity-40">
            Invite
          </button>
        </form>

        {inviteUrl && (
          <div className="mt-3 rounded-xl border border-purple/30 bg-purple/5 p-3">
            <p className="text-xs text-text-muted">Send this link once. It cannot be recovered later.</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-surface-elevated px-2 py-1.5 text-xs text-text">{inviteUrl}</code>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(inviteUrl).then(() => setCopied(true));
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-xs text-text-muted hover:text-text"
              >
                <Copy size={13} aria-hidden /> {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        <div className="mt-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-dim">Members</h3>
          {loading ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-text-dim">
              <Loader2 size={14} className="animate-spin" aria-hidden /> Loading…
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {members.map((member) => {
                const subject = { userId: member.userId, role: member.role };
                const isSelf = member.userId === currentUserId;
                const mayRemove = canRemoveMember(actor, subject).ok;
                const mayAssign = canAssignRole(actor, subject, 'member').ok;

                return (
                  <li key={member.userId} className="flex items-center gap-2 rounded-xl border border-border bg-surface-elevated/40 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-text">
                      {member.name || member.email || member.userId}
                      {isSelf && <span className="ml-1.5 text-xs text-text-dim">(you)</span>}
                      {member.name && member.email && (
                        <span className="ml-1.5 text-xs text-text-dim">{member.email}</span>
                      )}
                    </span>
                    {mayAssign ? (
                      <select
                        aria-label={`Role for ${member.name || member.email || member.userId}`}
                        value={member.role}
                        disabled={busy}
                        onChange={(event) =>
                          void run(() =>
                            apiUpdateMemberRole(id, member.userId, event.target.value as WorkspaceRole)
                          )
                        }
                        className="rounded-full border border-border bg-surface px-2 py-1 text-[11px] capitalize text-text focus:border-purple/50 focus:outline-none"
                      >
                        {ASSIGNABLE.map((option) => (
                          <option key={option} value={option} className="capitalize">
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] capitalize text-text-dim">
                        {member.role}
                      </span>
                    )}
                    {mayRemove && (
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={isSelf ? 'Leave workspace' : `Remove ${member.name || member.email || member.userId}`}
                        onClick={() => (isSelf ? void leave() : void run(() => apiRemoveMember(id, member.userId)))}
                        className="rounded-md p-1 text-text-dim hover:text-danger disabled:opacity-40"
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {invites.length > 0 && (
          <div className="mt-5">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-dim">Pending invitations</h3>
            <ul className="mt-2 space-y-1.5">
              {invites.map((invite) => (
                <li key={invite.id} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-text-muted">{invite.email}</span>
                  <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-[11px] capitalize text-text-dim">
                    {invite.role}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`Revoke invitation for ${invite.email}`}
                    onClick={() => void run(() => apiRevokeInvite(id, invite.id))}
                    className="rounded-md p-1 text-text-dim hover:text-danger disabled:opacity-40"
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {canDeleteWorkspace && (
          <div className="mt-6 rounded-xl border border-danger/30 bg-danger/5 p-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-danger">Danger zone</h3>
            <p className="mt-1 text-xs text-text-dim">
              Deletes this workspace and every project in it. Your personal workspace is not affected.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void destroy()}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-danger/40 px-3 py-2 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-40"
            >
              <Trash2 size={14} aria-hidden /> Delete workspace
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
