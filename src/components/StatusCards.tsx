'use client';

import { useProjectStore, MAX_NOW_SLOTS } from '../store/useProjectStore';
import { differenceInDays } from 'date-fns';
import { cn, getDeadlineState } from '../lib/utils';
import type { Project } from '../types';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function StatusCards() {
  const { projects, openDrawer, setFilter, setHealthFilter, setDeadlineFilter, setPriority } =
    useProjectStore();
  const drafts = useProjectStore((s) => s.drafts);
  const saving = Object.values(drafts).some((d) => d.status === 'saving');

  const nowProjects = projects.filter((p) => p.priority === 'Now');
  const rotting = projects.filter((p) => {
    const days = differenceInDays(new Date(), new Date(p.lastTouched));
    return days >= 7 && p.stage !== 'Archived' && p.stage !== 'Live';
  });

  const inFlight = projects.filter(
    (p) => p.stage === 'Exploring' || p.stage === 'Building' || p.stage === 'Testing'
  );

  const stageCounts = {
    Exploring: projects.filter((p) => p.stage === 'Exploring').length,
    Building: projects.filter((p) => p.stage === 'Building').length,
    Testing: projects.filter((p) => p.stage === 'Testing').length,
  };

  const overNowLimit = nowProjects.length > MAX_NOW_SLOTS;
  const claimable = projects.filter(
    (p) => p.priority !== 'Now' && p.stage !== 'Archived' && p.stage !== 'Paused'
  );

  const overdue = projects.filter((p) => getDeadlineState(p.targetDate, p.stage) === 'overdue');
  const blocked = projects.filter((p) => p.health === 'Blocked');
  const atRisk = projects.filter((p) => p.health === 'At risk');

  const attentionItems: {
    label: string;
    count: number;
    projects: Project[];
    filterAction: () => void;
  }[] = [
    {
      label: 'Overdue',
      count: overdue.length,
      projects: overdue,
      filterAction: () => {
        setFilter('All');
        setHealthFilter('All');
        setDeadlineFilter('overdue');
      },
    },
    {
      label: 'Blocked',
      count: blocked.length,
      projects: blocked,
      filterAction: () => {
        setFilter('All');
        setDeadlineFilter('All');
        setHealthFilter('Blocked');
      },
    },
    {
      label: 'At risk',
      count: atRisk.length,
      projects: atRisk,
      filterAction: () => {
        setFilter('All');
        setDeadlineFilter('All');
        setHealthFilter('At risk');
      },
    },
    {
      label: 'Stale (7+ days)',
      count: rotting.length,
      projects: rotting,
      filterAction: () => {
        setFilter('All');
        setHealthFilter('All');
        setDeadlineFilter('All');
      },
    },
  ].filter((item) => item.count > 0);

  const totalAttention = attentionItems.reduce((sum, i) => sum + i.count, 0);
  const emptyCount = Math.max(0, MAX_NOW_SLOTS - nowProjects.length);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <article className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs text-text-muted">Work on this Now</p>
          <p className={cn('mt-2 text-3xl font-semibold tabular-nums tracking-tight', overNowLimit ? 'text-warning' : 'text-purple-light')}>
            {pad(nowProjects.length)}
          </p>
          <p className="mt-2 text-xs text-text-dim">
            {overNowLimit ? `Over the ${MAX_NOW_SLOTS}-slot soft cap` : `Soft cap of ${MAX_NOW_SLOTS}`}
          </p>
        </article>
        <article className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs text-text-muted">Needs attention</p>
          <p className={cn('mt-2 text-3xl font-semibold tabular-nums tracking-tight', totalAttention > 0 ? 'text-warning' : 'text-text')}>
            {pad(totalAttention)}
          </p>
          <p className="mt-2 text-xs text-text-dim">
            {totalAttention === 0 ? 'All clear' : 'Overdue, blocked, at risk, or stale'}
          </p>
        </article>
        <article className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs text-text-muted">In flight</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-text">{pad(inFlight.length)}</p>
          <p className="mt-2 text-xs text-text-dim">
            {stageCounts.Exploring} exploring · {stageCounts.Building} building · {stageCounts.Testing} testing
          </p>
        </article>
        <article className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs text-text-muted">Workspace</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-success">
            {saving ? '…' : 'OK'}
          </p>
          <p className="mt-2 text-xs text-text-dim">{saving ? 'Saving changes' : Object.keys(drafts).length ? 'Unsaved drafts' : 'Synced'}</p>
        </article>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-text">Now slots</h3>
          <p className="text-xs text-text-dim">{nowProjects.length} / {MAX_NOW_SLOTS}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {nowProjects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => openDrawer(p.id)}
              className="relative overflow-hidden text-left rounded-2xl border border-border bg-surface p-4 hover:border-purple/40 transition-colors"
            >
              <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-purple to-blue" />
              <div className="flex flex-wrap gap-1.5 mb-3">
                <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-[11px] text-text-muted">{p.stage}</span>
                <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-[11px] text-text-muted">{p.health}</span>
                <span className="rounded-full bg-purple/15 px-2 py-0.5 text-[11px] text-purple-light">Now</span>
              </div>
              <p className="font-semibold text-text">{p.name}</p>
              <div className="mt-3 h-1 rounded-full bg-border-subtle overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-purple to-blue" style={{ width: `${p.progress}%` }} />
              </div>
              <p className="mt-3 text-[11px] uppercase tracking-wider text-text-dim">Next action</p>
              <p className="text-sm text-text truncate">{p.nextAction || '—'}</p>
            </button>
          ))}
          {Array.from({ length: emptyCount }).map((_, i) => {
            const suggestion = claimable[i];
            return (
              <div
                key={`empty-${i}`}
                className="rounded-2xl border border-dashed border-border min-h-[168px] p-4 flex flex-col items-center justify-center text-center"
              >
                <p className="text-sm text-text-dim">Open slot</p>
                {suggestion ? (
                  <button
                    type="button"
                    onClick={() => setPriority(suggestion.id, 'Now')}
                    className="mt-2 max-w-full truncate rounded-lg bg-purple/15 px-3 py-1.5 text-xs font-medium text-purple-light hover:bg-purple/25"
                  >
                    Claim {suggestion.name}
                  </button>
                ) : (
                  <p className="mt-1 text-xs text-text-dim">Mark a project Now to fill this.</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {totalAttention > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <h3 className="text-xs font-semibold tracking-wider text-text-muted uppercase mb-3">Needs attention</h3>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {attentionItems.map((item) => (
              <div key={item.label} className="min-w-[140px]">
                <button type="button" onClick={item.filterAction} className="text-left group" aria-label={`Filter to ${item.count} ${item.label} projects`}>
                  <span className="text-xs text-text-dim group-hover:text-text">{item.label}</span>
                  <div className="mt-0.5 text-xl font-semibold tabular-nums text-text">{item.count}</div>
                </button>
                <div className="mt-1 flex flex-wrap gap-1">
                  {item.projects.slice(0, 3).map((p) => (
                    <button key={p.id} type="button" onClick={() => openDrawer(p.id)} className="text-xs text-purple-light hover:underline">
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
