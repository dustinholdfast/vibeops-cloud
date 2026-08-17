'use client';

import { useProjectStore } from '../store/useProjectStore';
import {
  formatLastTouched,
  formatTargetDate,
  getDeadlineState,
  deadlineLabel,
  cn,
  HEALTH_OPTIONS,
} from '../lib/utils';
import type { Priority, Stage, Health, DeadlineState } from '../types';
import { Check, ExternalLink } from 'lucide-react';

const stageColor: Record<Stage, string> = {
  Exploring: 'bg-blue',
  Building: 'bg-purple',
  Testing: 'bg-orange',
  Live: 'bg-success',
  Paused: 'bg-text-dim',
  Archived: 'bg-text-dim',
};

const healthStyles: Record<Health, string> = {
  'On track': 'bg-success/15 text-success border-success/30',
  'At risk': 'bg-warning/15 text-warning border-warning/30',
  Blocked: 'bg-danger/15 text-danger border-danger/30',
};

const deadlineStyles: Record<DeadlineState, string> = {
  none: 'text-text-dim',
  overdue: 'text-danger font-medium',
  'due-today': 'text-warning font-medium',
  'due-soon': 'text-orange',
  future: 'text-text-muted',
  inactive: 'text-text-dim',
};

export function ProjectList() {
  const {
    projects,
    filter,
    healthFilter,
    deadlineFilter,
    search,
    openDrawer,
    setPriority,
    setHealth,
    setHealthFilter,
    setDeadlineFilter,
  } = useProjectStore();

  const filtered = projects
    .filter((p) => (filter === 'All' ? true : p.stage === filter))
    .filter((p) => (healthFilter === 'All' ? true : p.health === healthFilter))
    .filter((p) => {
      if (deadlineFilter === 'All') return true;
      return getDeadlineState(p.targetDate, p.stage) === deadlineFilter;
    })
    .filter((p) =>
      search
        ? p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.nextAction.toLowerCase().includes(search.toLowerCase())
        : true
    );

  const hasActiveSecondaryFilter =
    healthFilter !== 'All' || deadlineFilter !== 'All';

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3 gap-4 flex-wrap">
        <h2 className="text-sm font-medium text-text">
          All projects
          <span className="ml-2 text-text-dim font-normal">
            {filtered.length} project{filtered.length === 1 ? '' : 's'}
          </span>
        </h2>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5" role="group" aria-label="Filter by health">
            <span className="text-[11px] uppercase tracking-wider text-text-dim mr-1">
              Health
            </span>
            {(['All', ...HEALTH_OPTIONS] as const).map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setHealthFilter(h)}
                className={cn(
                  'px-2 py-0.5 rounded text-xs font-medium transition-colors border',
                  healthFilter === h
                    ? 'bg-purple/20 text-purple-light border-purple/40'
                    : 'bg-surface-elevated text-text-dim border-transparent hover:text-text'
                )}
                aria-pressed={healthFilter === h}
              >
                {h}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5" role="group" aria-label="Filter by deadline">
            <span className="text-[11px] uppercase tracking-wider text-text-dim mr-1">
              Deadline
            </span>
            {(
              [
                { value: 'All', label: 'All' },
                { value: 'overdue', label: 'Overdue' },
                { value: 'due-today', label: 'Due today' },
                { value: 'due-soon', label: 'Due soon' },
                { value: 'none', label: 'No date' },
              ] as const
            ).map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => setDeadlineFilter(d.value)}
                className={cn(
                  'px-2 py-0.5 rounded text-xs font-medium transition-colors border',
                  deadlineFilter === d.value
                    ? 'bg-purple/20 text-purple-light border-purple/40'
                    : 'bg-surface-elevated text-text-dim border-transparent hover:text-text'
                )}
                aria-pressed={deadlineFilter === d.value}
              >
                {d.label}
              </button>
            ))}
          </div>

          {hasActiveSecondaryFilter && (
            <button
              type="button"
              onClick={() => {
                setHealthFilter('All');
                setDeadlineFilter('All');
              }}
              className="text-xs text-text-dim hover:text-text underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div
          className="grid gap-3 px-4 py-2.5 text-[11px] font-medium tracking-wider text-text-dim uppercase border-b border-border-subtle"
          style={{
            gridTemplateColumns: 'minmax(180px,1.4fr) 100px 130px 110px 120px 100px 70px',
          }}
        >
          <div>Project & Next Action</div>
          <div>Stage</div>
          <div>Priority</div>
          <div>Health</div>
          <div>Target</div>
          <div>Last Touched</div>
          <div>Links</div>
        </div>

        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-text-dim">
            No projects match the current filters.
          </div>
        ) : (
          filtered.map((project) => {
            const deadline = getDeadlineState(project.targetDate, project.stage);
            return (
              <div
                key={project.id}
                onClick={() => openDrawer(project.id)}
                className="grid gap-3 px-4 py-3.5 border-b border-border-subtle last:border-0 hover:bg-surface-elevated/60 cursor-pointer transition-colors group"
                style={{
                  gridTemplateColumns:
                    'minmax(180px,1.4fr) 100px 130px 110px 120px 100px 70px',
                }}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text truncate">{project.name}</span>
                    <div className="h-1 w-12 rounded-full bg-border-subtle overflow-hidden flex-shrink-0">
                      <div
                        className="h-full bg-purple rounded-full"
                        style={{ width: `${project.progress}%` }}
                      />
                    </div>
                  </div>
                  <p className="text-sm text-text-muted truncate mt-0.5">
                    {project.nextAction}
                  </p>
                </div>

                <div className="flex items-center">
                  <span className="inline-flex items-center gap-1.5 text-sm text-text-muted">
                    <span
                      className={cn('w-1.5 h-1.5 rounded-full', stageColor[project.stage])}
                      aria-hidden
                    />
                    {project.stage}
                  </span>
                </div>

                <div
                  className="flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  {(['Now', 'Next', 'Later'] as Priority[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(project.id, p)}
                      className={cn(
                        'px-2 py-0.5 rounded text-xs font-medium transition-colors',
                        project.priority === p
                          ? 'bg-purple text-white'
                          : 'bg-surface-elevated text-text-dim hover:text-text hover:bg-border'
                      )}
                      aria-pressed={project.priority === p}
                      aria-label={`Set priority to ${p}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <div
                  className="flex items-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <label className="sr-only" htmlFor={`health-${project.id}`}>
                    Health for {project.name}
                  </label>
                  <select
                    id={`health-${project.id}`}
                    value={project.health}
                    onChange={(e) => setHealth(project.id, e.target.value as Health)}
                    className={cn(
                      'appearance-none text-xs font-medium rounded px-2 py-1 border cursor-pointer focus:outline-none focus:ring-1 focus:ring-purple/50',
                      healthStyles[project.health]
                    )}
                    aria-label={`Health status: ${project.health}`}
                  >
                    {HEALTH_OPTIONS.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center text-sm">
                  {deadline === 'none' ? (
                    <span className="text-text-dim italic text-xs">Set a target date</span>
                  ) : (
                    <span className={cn('text-xs', deadlineStyles[deadline])}>
                      {deadlineLabel(deadline)}
                      {project.targetDate && deadline !== 'inactive' && (
                        <span className="block text-text-dim font-normal">
                          {formatTargetDate(project.targetDate)}
                        </span>
                      )}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-sm text-text-muted">
                  <span>{formatLastTouched(project.lastTouched)}</span>
                  <Check size={14} className="text-success" aria-hidden />
                </div>

                <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                  {project.liveUrl ? (
                    <a
                      href={project.liveUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-purple-light"
                      aria-label={`Open live URL for ${project.name}`}
                    >
                      Live <ExternalLink size={12} aria-hidden />
                    </a>
                  ) : (
                    <span className="text-xs text-text-dim">—</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
