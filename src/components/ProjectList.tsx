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
import { isRotting, quietLabel } from '../lib/rotting';
import type { Priority, Stage, Health, DeadlineState } from '../types';
import { ExternalLink, Github } from 'lucide-react';
import { SaveStatusChip } from './SaveStatus';

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

const chip =
  'rounded-full bg-surface-elevated px-2 py-0.5 text-[11px] text-text-muted';

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

  const hasActiveSecondaryFilter = healthFilter !== 'All' || deadlineFilter !== 'All';

  return (
    <div className="mt-8">
      <div className="flex items-end justify-between mb-3 gap-4 flex-wrap">
        <div>
          <h2 className="text-sm font-medium text-text">All projects</h2>
          <p className="text-xs text-text-dim mt-0.5">
            {filtered.length} match{filtered.length === 1 ? '' : 'es'}
            {filter !== 'All' ? ` in ${filter}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <FilterGroup label="Health">
            {(['All', ...HEALTH_OPTIONS] as const).map((h) => (
              <FilterChip
                key={h}
                active={healthFilter === h}
                onClick={() => setHealthFilter(h)}
              >
                {h}
              </FilterChip>
            ))}
          </FilterGroup>

          <FilterGroup label="Deadline">
            {(
              [
                { value: 'All', label: 'All' },
                { value: 'overdue', label: 'Overdue' },
                { value: 'due-today', label: 'Today' },
                { value: 'due-soon', label: 'Soon' },
                { value: 'none', label: 'No date' },
              ] as const
            ).map((d) => (
              <FilterChip
                key={d.value}
                active={deadlineFilter === d.value}
                onClick={() => setDeadlineFilter(d.value)}
              >
                {d.label}
              </FilterChip>
            ))}
          </FilterGroup>

          {hasActiveSecondaryFilter && (
            <button
              type="button"
              onClick={() => {
                setHealthFilter('All');
                setDeadlineFilter('All');
              }}
              className="text-xs text-text-dim hover:text-text"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-sm text-text-dim">
          No projects match the current filters.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((project) => {
            const deadline = getDeadlineState(project.targetDate, project.stage);
            const rotting = isRotting(project);
            return (
              <div
                key={project.id}
                onClick={() => openDrawer(project.id)}
                className={cn(
                  'group rounded-2xl border bg-surface px-4 py-3.5 cursor-pointer transition-colors',
                  rotting ? 'border-warning/45 hover:border-warning/70' : 'border-border hover:border-purple/40'
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-text truncate">{project.name}</span>
                      <span className={chip}>
                        <span
                          className={cn('inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle', stageColor[project.stage])}
                          aria-hidden
                        />
                        {project.stage}
                      </span>
                      {project.priority === 'Now' && (
                        <span className="rounded-full bg-purple/15 px-2 py-0.5 text-[11px] text-purple-light">Now</span>
                      )}
                      {rotting && (
                        <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] text-warning">
                          {quietLabel(project)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-text-muted truncate mt-1">{project.nextAction || 'No next action yet'}</p>
                    <div className="mt-2.5 h-1 rounded-full bg-border-subtle overflow-hidden max-w-xs">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-purple to-blue"
                        style={{ width: `${project.progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      {(['Now', 'Next', 'Later'] as Priority[]).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPriority(project.id, p)}
                          className={cn(
                            'px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors',
                            project.priority === p
                              ? 'bg-purple text-white'
                              : 'bg-surface-elevated text-text-dim hover:text-text'
                          )}
                          aria-pressed={project.priority === p}
                          aria-label={`Set priority to ${p}`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                    <select
                      id={`health-${project.id}`}
                      value={project.health}
                      onChange={(e) => setHealth(project.id, e.target.value as Health)}
                      className={cn(
                        'appearance-none text-[11px] font-medium rounded-full px-2 py-0.5 border cursor-pointer focus:outline-none focus:ring-1 focus:ring-purple/50',
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
                </div>

                <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-text-dim">
                  <div className="flex items-center gap-3 min-w-0">
                    {deadline === 'none' ? (
                      <span>No target</span>
                    ) : (
                      <span className={deadlineStyles[deadline]}>
                        {deadlineLabel(deadline)}
                        {project.targetDate && deadline !== 'inactive'
                          ? ` · ${formatTargetDate(project.targetDate)}`
                          : ''}
                      </span>
                    )}
                    <span>{formatLastTouched(project.lastTouched)}</span>
                    <SaveStatusChip id={project.id} />
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    {project.liveUrl && (
                      <a
                        href={project.liveUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 hover:text-purple-light"
                        aria-label={`Open live URL for ${project.name}`}
                      >
                        Live <ExternalLink size={11} aria-hidden />
                      </a>
                    )}
                    {project.repoUrl && (
                      <a
                        href={project.repoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 hover:text-purple-light"
                        aria-label={`Open repo for ${project.name}`}
                      >
                        <Github size={11} aria-hidden /> Repo
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={`Filter by ${label.toLowerCase()}`}>
      <span className="text-[10px] uppercase tracking-wider text-text-dim mr-0.5">{label}</span>
      {children}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors border',
        active
          ? 'bg-purple/20 text-purple-light border-purple/40'
          : 'bg-surface-elevated text-text-dim border-transparent hover:text-text'
      )}
    >
      {children}
    </button>
  );
}
