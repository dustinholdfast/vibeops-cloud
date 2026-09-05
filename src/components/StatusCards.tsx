'use client';

import { useProjectStore, MAX_NOW_SLOTS } from '../store/useProjectStore';
import { differenceInDays } from 'date-fns';
import { cn, getDeadlineState } from '../lib/utils';
import type { Project } from '../types';

export function StatusCards() {
  const { projects, openDrawer, setFilter, setHealthFilter, setDeadlineFilter } =
    useProjectStore();
  const drafts = useProjectStore((s) => s.drafts);
  const saving = Object.values(drafts).some((d) => d.status === 'saving');

  const nowProjects = projects.filter((p) => p.priority === 'Now');
  const rotting = projects.filter((p) => {
    const days = differenceInDays(new Date(), new Date(p.lastTouched));
    return days >= 7 && p.stage !== 'Archived' && p.stage !== 'Live';
  });

  const inFlight = projects.filter(
    (p) =>
      p.stage === 'Exploring' || p.stage === 'Building' || p.stage === 'Testing'
  );

  const stageCounts = {
    Exploring: projects.filter((p) => p.stage === 'Exploring').length,
    Building: projects.filter((p) => p.stage === 'Building').length,
    Testing: projects.filter((p) => p.stage === 'Testing').length,
  };

  const overNowLimit = nowProjects.length > MAX_NOW_SLOTS;

  const overdue = projects.filter(
    (p) => getDeadlineState(p.targetDate, p.stage) === 'overdue'
  );
  const blocked = projects.filter((p) => p.health === 'Blocked');
  const atRisk = projects.filter((p) => p.health === 'At risk');
  const stale = rotting;

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
      count: stale.length,
      projects: stale,
      filterAction: () => {
        setFilter('All');
        setHealthFilter('All');
        setDeadlineFilter('All');
      },
    },
  ].filter((item) => item.count > 0);

  const totalAttention = attentionItems.reduce((sum, i) => sum + i.count, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          className={cn(
            'rounded-xl border p-4 transition-all',
            nowProjects.length > 0
              ? overNowLimit
                ? 'border-warning/50 bg-warning/5'
                : 'border-purple/50 bg-purple/5 shadow-[0_0_20px_-5px_rgba(139,124,246,0.3)]'
              : 'border-border bg-surface'
          )}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold tracking-wider text-purple-light uppercase">
              Work on this now
            </h3>
            <span
              className={cn(
                'text-xs tabular-nums',
                overNowLimit ? 'text-warning font-medium' : 'text-text-dim'
              )}
            >
              {nowProjects.length} / {MAX_NOW_SLOTS} now slots
              {overNowLimit && ' · over limit'}
            </span>
          </div>

          {nowProjects.length === 0 ? (
            <div className="py-2">
              <p className="text-sm text-text-muted">
                No project is marked{' '}
                <span className="text-purple-light font-medium">Now</span>.
              </p>
              <p className="text-sm text-text-dim mt-1">
                Pick one and everything else gets quieter.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {nowProjects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openDrawer(p.id)}
                  className="w-full text-left group"
                >
                  <p className="text-base font-semibold text-text group-hover:text-purple-light transition-colors">
                    {p.name}
                  </p>
                  <p className="text-sm text-text-muted mt-0.5 truncate">{p.nextAction}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs text-text-dim">
                      <span
                        className={cn(
                          'w-1.5 h-1.5 rounded-full',
                          p.stage === 'Testing' && 'bg-orange',
                          p.stage === 'Exploring' && 'bg-blue',
                          p.stage === 'Building' && 'bg-purple',
                          p.stage === 'Live' && 'bg-success',
                          (p.stage === 'Paused' || p.stage === 'Archived') && 'bg-text-dim'
                        )}
                      />
                      {p.stage}
                    </span>
                  </div>
                </button>
              ))}
              {overNowLimit && (
                <p className="text-xs text-warning mt-1">
                  Soft limit is {MAX_NOW_SLOTS}. Consider demoting some to Next.
                </p>
              )}
              {!overNowLimit && nowProjects.length > 0 && (
                <p className="text-xs text-text-dim mt-1">Everything else is quieter.</p>
              )}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <h3 className="text-xs font-semibold tracking-wider text-text-muted uppercase mb-3">
            Rotting
          </h3>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold tabular-nums text-text">
              {String(rotting.length).padStart(2, '0')}
            </span>
          </div>
          <p className="text-sm text-text-dim mt-1">
            {rotting.length === 0 ? 'No rotting projects' : 'untouched 7+ days'}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold tracking-wider text-text-muted uppercase">
              In flight
            </h3>
            <span className="text-xs text-text-dim" role="status">{saving ? 'Saving…' : Object.keys(drafts).length ? 'Unsaved changes' : 'Saved'}</span>
          </div>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-4xl font-bold tabular-nums text-text">
              {String(inFlight.length).padStart(2, '0')}
            </span>
            <span className="text-sm text-text-dim">active builds</span>
          </div>

          <div className="space-y-2">
            {(
              [
                { label: 'Exploring', count: stageCounts.Exploring, color: 'bg-purple' },
                { label: 'Building', count: stageCounts.Building, color: 'bg-blue' },
                { label: 'Testing', count: stageCounts.Testing, color: 'bg-orange' },
              ] as const
            ).map((row) => (
              <div key={row.label} className="flex items-center gap-2 text-xs">
                <span className="w-16 text-text-dim">{row.label}</span>
                <div className="flex-1 h-1.5 bg-border-subtle rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all', row.color)}
                    style={{
                      width: `${Math.min(
                        100,
                        (row.count / Math.max(1, inFlight.length)) * 100
                      )}%`,
                    }}
                  />
                </div>
                <span className="w-4 text-right tabular-nums text-text-muted">
                  {row.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold tracking-wider text-text-muted uppercase">
            Needs attention
          </h3>
          {totalAttention > 0 && (
            <span className="text-xs tabular-nums text-text-dim">
              {totalAttention} signal{totalAttention === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {totalAttention === 0 ? (
          <p className="text-sm text-text-muted py-1">
            All clear — no overdue, blocked, or at-risk projects.
          </p>
        ) : (
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {attentionItems.map((item) => (
              <div key={item.label} className="min-w-[140px]">
                <button
                  type="button"
                  onClick={item.filterAction}
                  className="text-left group"
                  aria-label={`Filter to ${item.count} ${item.label} projects`}
                >
                  <span className="text-xs text-text-dim group-hover:text-text">
                    {item.label}
                  </span>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="text-xl font-semibold tabular-nums text-text">
                      {item.count}
                    </span>
                  </div>
                </button>
                <div className="mt-1 flex flex-wrap gap-1">
                  {item.projects.slice(0, 3).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => openDrawer(p.id)}
                      className="text-xs text-purple-light hover:underline"
                    >
                      {p.name}
                    </button>
                  ))}
                  {item.projects.length > 3 && (
                    <span className="text-xs text-text-dim">
                      +{item.projects.length - 3}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
