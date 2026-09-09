'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Check,
  ChevronsUpDown,
  CreditCard,
  Activity,
  Mail,
  Plus,
  Shield,
  Trash2,
  Users,
} from 'lucide-react';
import { apiDeleteWorkspace, getActiveWorkspace, parseJson, setActiveWorkspace, WORKSPACE_HEADER } from '../lib/api';
import { useProjectStore } from '../store/useProjectStore';
import { can } from '../lib/workspace-roles';
import { cn } from '../lib/utils';
import { WorkspaceMembers } from './WorkspaceMembers';

type BillingStatus = {
  plan: 'free' | 'pro';
  status: string;
  projectCount: number;
  projectLimit: number | null;
  manageable: boolean;
};

export function WorkspaceMenu() {
  const workspaces = useProjectStore((s) => s.workspaces);
  const workspaceId = useProjectStore((s) => s.workspaceId);
  const workspaceError = useProjectStore((s) => s.workspaceError);
  const switching = useProjectStore((s) => s.switchingWorkspace);
  const switchWorkspace = useProjectStore((s) => s.switchWorkspace);
  const createWorkspace = useProjectStore((s) => s.createWorkspace);
  const loadWorkspaces = useProjectStore((s) => s.loadWorkspaces);
  const loadProjects = useProjectStore((s) => s.loadProjects);
  const drafts = useProjectStore((s) => s.drafts);
  const creation = useProjectStore((s) => s.creation);
  const creating = useProjectStore((s) => s.creating);
  const operationBusy = useProjectStore((s) => s.operationBusy);
  const projectCount = useProjectStore((s) => s.projects.length);

  const [open, setOpen] = useState(false);
  const [creatingWs, setCreatingWs] = useState(false);
  const [name, setName] = useState('');
  const [managing, setManaging] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [digest, setDigest] = useState<boolean | null>(null);
  const [digestBusy, setDigestBusy] = useState(false);
  // Null while unknown, and also when the uptime migration is not applied — the
  // switch stays hidden rather than offering something that would not persist.
  const [alerts, setAlerts] = useState<boolean | null>(null);
  const [alertsBusy, setAlertsBusy] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const active =
    workspaces.find((w) => w.workspaceId === workspaceId) ??
    workspaces.find((w) => w.personal) ??
    null;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    let live = true;
    const workspace = getActiveWorkspace();
    void fetch('/api/billing/status', {
      credentials: 'include',
      headers: workspace ? { [WORKSPACE_HEADER]: workspace } : undefined,
    })
      .then((res) => (res.ok ? parseJson<BillingStatus>(res) : null))
      .then((data) => {
        if (live && data?.plan) setBilling(data);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [projectCount, workspaceId]);

  useEffect(() => {
    let live = true;
    void fetch('/api/email/preferences', { credentials: 'include' })
      .then((res) =>
        res.ok
          ? (res.json() as Promise<{ weeklyDigest?: unknown; uptimeAlerts?: unknown }>)
          : null
      )
      .then((data) => {
        if (!live) return;
        if (typeof data?.weeklyDigest === 'boolean') setDigest(data.weeklyDigest);
        if (typeof data?.uptimeAlerts === 'boolean') setAlerts(data.uptimeAlerts);
      })
      .catch(() => undefined);
    void fetch('/api/admin/me', { credentials: 'include' })
      .then((res) => {
        if (live && res.ok) setIsAdmin(true);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  if (workspaces.length === 0) return null;

  const submitNew = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const created = await createWorkspace(trimmed);
    if (created) {
      setName('');
      setCreatingWs(false);
      setOpen(false);
    }
  };

  const canDelete =
    active && !active.personal && can(active.role, 'manage:workspace') && !deleting;

  const deleteActive = async () => {
    if (!active || active.personal) return;
    if (creating || operationBusy || creation || Object.keys(drafts).length) {
      useProjectStore.setState({
        workspaceError: 'Save or discard pending changes before deleting this workspace.',
      });
      return;
    }
    const ok = window.confirm(
      `Delete “${active.name}”? All projects in this workspace will be permanently removed. This cannot be undone.`
    );
    if (!ok) return;
    setDeleting(true);
    try {
      await apiDeleteWorkspace(active.workspaceId);
      setActiveWorkspace(null);
      await loadWorkspaces();
      await loadProjects();
      setOpen(false);
    } catch (cause) {
      useProjectStore.setState({
        workspaceError:
          cause instanceof Error ? cause.message : 'Could not delete that workspace.',
      });
    } finally {
      setDeleting(false);
    }
  };

  const toggleDigest = async () => {
    if (digest === null) return;
    const next = !digest;
    setDigestBusy(true);
    setDigest(next);
    try {
      const res = await fetch('/api/email/preferences', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weeklyDigest: next }),
      });
      if (!res.ok) throw new Error('failed');
    } catch {
      setDigest(!next);
    } finally {
      setDigestBusy(false);
    }
  };

  const toggleAlerts = async () => {
    if (alerts === null) return;
    const next = !alerts;
    setAlertsBusy(true);
    setAlerts(next);
    try {
      const res = await fetch('/api/email/preferences', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uptimeAlerts: next }),
      });
      if (!res.ok) throw new Error('failed');
    } catch {
      setAlerts(!next);
    } finally {
      setAlertsBusy(false);
    }
  };

  const openPortal = async () => {
    setPortalBusy(true);
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST', credentials: 'include' });
      const data = await parseJson<{ url?: string; error?: string }>(res);
      if (data.url) window.location.href = data.url;
    } finally {
      setPortalBusy(false);
    }
  };

  const planLabel = billing?.plan === 'pro' ? 'Pro' : 'Free';
  const usage =
    billing == null
      ? null
      : billing.projectLimit === null
        ? `${billing.projectCount}`
        : `${billing.projectCount}/${billing.projectLimit}`;

  return (
    <div ref={containerRef} className="relative px-2 pb-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={switching || deleting}
        className="flex w-full items-center gap-2 rounded-xl border border-border bg-surface-elevated px-2.5 py-2 text-left transition-colors hover:border-purple/40 disabled:opacity-60"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-text">
            {active?.name ?? 'Personal'}
          </span>
          <span className="block text-[11px] text-text-dim">
            {deleting ? 'Deleting…' : switching ? 'Switching…' : active?.role ?? 'owner'}
            {usage ? ` · ${usage}` : ''}
          </span>
        </span>
        <span
          className={
            billing?.plan === 'pro'
              ? 'rounded-full bg-purple/15 px-2 py-0.5 text-[10px] font-medium text-purple-light'
              : 'rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium text-text-muted'
          }
        >
          {planLabel}
        </span>
        <ChevronsUpDown size={14} className="flex-shrink-0 text-text-dim" aria-hidden />
      </button>

      {workspaceError && (
        <p role="alert" className="mt-1 px-1 text-xs text-danger">
          {workspaceError}
        </p>
      )}

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-2 right-2 z-30 mb-1 rounded-xl border border-border bg-surface-elevated p-1 shadow-lg"
        >
          <p className="px-2 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-dim">
            Switch
          </p>
          <ul className="max-h-48 overflow-y-auto">
            {workspaces.map((workspace) => {
              const isActive = workspace.workspaceId === (active?.workspaceId ?? null);
              return (
                <li key={workspace.workspaceId}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      void switchWorkspace(workspace.workspaceId);
                      setOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors',
                      isActive ? 'bg-purple/15 text-purple-light' : 'text-text-muted hover:text-text'
                    )}
                  >
                    <Check
                      size={14}
                      aria-hidden
                      className={cn('flex-shrink-0', isActive ? 'opacity-100' : 'opacity-0')}
                    />
                    <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                    <span className="flex-shrink-0 text-[11px] capitalize text-text-dim">
                      {workspace.role}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-1 border-t border-border-subtle pt-1">
            {creatingWs ? (
              <form onSubmit={submitNew} className="p-1">
                <label htmlFor="new-workspace" className="sr-only">
                  Workspace name
                </label>
                <input
                  id="new-workspace"
                  autoFocus
                  value={name}
                  maxLength={60}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Workspace name"
                  className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text placeholder:text-text-dim focus:border-purple/50 focus:outline-none"
                />
                <div className="mt-1.5 flex gap-1.5">
                  <button
                    type="submit"
                    disabled={!name.trim()}
                    className="flex-1 rounded-md bg-purple px-2 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreatingWs(false);
                      setName('');
                    }}
                    className="rounded-md border border-border px-2 py-1.5 text-xs text-text-muted"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <MenuItem onClick={() => setCreatingWs(true)} icon={<Plus size={14} />}>
                New workspace
              </MenuItem>
            )}

            {active && !active.personal && can(active.role, 'manage:members') && (
              <MenuItem
                onClick={() => {
                  setManaging(true);
                  setOpen(false);
                }}
                icon={<Users size={14} />}
              >
                Manage people
              </MenuItem>
            )}

            {digest !== null && (
              <button
                type="button"
                role="menuitem"
                onClick={() => void toggleDigest()}
                disabled={digestBusy}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-text-muted hover:text-text disabled:opacity-60"
              >
                <Mail size={14} aria-hidden />
                <span className="flex-1 text-left">Weekly review email</span>
                <span
                  aria-hidden
                  className={cn(
                    'relative h-4 w-7 flex-shrink-0 rounded-full',
                    digest ? 'bg-purple' : 'bg-border'
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform',
                      digest ? 'translate-x-3.5' : 'translate-x-0.5'
                    )}
                  />
                </span>
              </button>
            )}

            {alerts !== null && (
              <button
                type="button"
                role="menuitem"
                onClick={() => void toggleAlerts()}
                disabled={alertsBusy}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-text-muted hover:text-text disabled:opacity-60"
              >
                <Activity size={14} aria-hidden />
                <span className="flex-1 text-left">Uptime alerts</span>
                <span
                  aria-hidden
                  className={cn(
                    'relative h-4 w-7 flex-shrink-0 rounded-full',
                    alerts ? 'bg-purple' : 'bg-border'
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform',
                      alerts ? 'translate-x-3.5' : 'translate-x-0.5'
                    )}
                  />
                </span>
              </button>
            )}

            {billing?.manageable && billing.plan === 'free' && (
              <Link
                href="/pricing"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-text-muted hover:text-text"
              >
                <CreditCard size={14} aria-hidden />
                Upgrade to Pro
              </Link>
            )}
            {billing?.manageable && billing.plan === 'pro' && (
              <MenuItem onClick={() => void openPortal()} icon={<CreditCard size={14} />}>
                {portalBusy ? 'Opening…' : 'Manage billing'}
              </MenuItem>
            )}
            {billing && !billing.manageable && (
              <p className="px-2 py-1.5 text-[11px] text-text-dim">Billing is managed by the owner.</p>
            )}

            {isAdmin && (
              <Link
                href="/admin"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-text-muted hover:text-text"
              >
                <Shield size={14} aria-hidden />
                Admin console
              </Link>
            )}

            {canDelete && (
              <MenuItem onClick={() => void deleteActive()} icon={<Trash2 size={14} />} danger>
                Delete workspace
              </MenuItem>
            )}
          </div>
        </div>
      )}

      {managing && active && (
        <WorkspaceMembers workspace={active} onClose={() => setManaging(false)} />
      )}
    </div>
  );
}

function MenuItem({
  children,
  icon,
  onClick,
  danger = false,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors',
        danger ? 'text-danger/90 hover:text-danger' : 'text-text-muted hover:text-text'
      )}
    >
      {icon}
      {children}
    </button>
  );
}
