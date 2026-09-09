'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Plus, Trash2, Users } from 'lucide-react';
import { apiDeleteWorkspace, setActiveWorkspace } from '../lib/api';
import { useProjectStore } from '../store/useProjectStore';
import { can } from '../lib/workspace-roles';
import { cn } from '../lib/utils';
import { WorkspaceMembers } from './WorkspaceMembers';

export function WorkspaceSwitcher() {
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

  const [open, setOpen] = useState(false);
  const [creatingWs, setCreatingWs] = useState(false);
  const [name, setName] = useState('');
  const [managing, setManaging] = useState(false);
  const [deleting, setDeleting] = useState(false);
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

  return (
    <div ref={containerRef} className="relative px-2 pb-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={switching || deleting}
        className="flex w-full items-center gap-2 rounded-lg border border-border bg-surface-elevated px-2.5 py-2 text-left text-sm transition-colors hover:border-purple/40 disabled:opacity-60"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-text">
            {active?.name ?? 'Personal'}
          </span>
          <span className="block text-[11px] capitalize text-text-dim">
            {deleting ? 'Deleting…' : switching ? 'Switching…' : active?.role ?? 'owner'}
          </span>
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
          className="absolute bottom-full left-2 right-2 z-30 mb-1 rounded-lg border border-border bg-surface-elevated p-1 shadow-lg"
        >
          <ul className="max-h-64 overflow-y-auto">
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
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
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
              <button
                type="button"
                role="menuitem"
                onClick={() => setCreatingWs(true)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text-muted transition-colors hover:text-text"
              >
                <Plus size={14} aria-hidden /> New workspace
              </button>
            )}

            {active && !active.personal && can(active.role, 'manage:members') && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setManaging(true);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text-muted transition-colors hover:text-text"
              >
                <Users size={14} aria-hidden /> Manage people
              </button>
            )}

            {canDelete && (
              <button
                type="button"
                role="menuitem"
                onClick={() => void deleteActive()}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-danger/90 transition-colors hover:text-danger"
              >
                <Trash2 size={14} aria-hidden /> Delete workspace
              </button>
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
