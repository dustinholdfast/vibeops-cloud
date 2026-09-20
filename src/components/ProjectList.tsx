'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { apiListUptime } from '../lib/api';
import type { Priority, Stage, Health, DeadlineState, Project, UptimeRow, WorkspaceUptime } from '../types';
import { Columns, ExternalLink, Github, Hand, LayoutList } from 'lucide-react';
import { SaveStatusChip } from './SaveStatus';
import { UptimeChip } from './UptimeChip';
import { ProgressControl } from './ProgressControl';
import { ProjectBoard } from './ProjectBoard';
import { toastBatchHealth, toastBatchStage, toastDelete } from '../lib/dashboard-mutations';
import {
  BOARD_STAGES,
  chip,
  healthStyles,
  readStoredView,
  stageColor,
  writeStoredView,
  type ProjectView,
} from '../lib/project-ui';

/** Kept in step with the /uptime page — checks themselves run every few minutes. */
const UPTIME_REFRESH_MS = 60_000;

const deadlineStyles: Record<DeadlineState, string> = {
  none: 'text-text-dim',
  overdue: 'text-danger font-medium',
  'due-today': 'text-warning font-medium',
  'due-soon': 'text-orange',
  future: 'text-text-muted',
  inactive: 'text-text-dim',
};

function uptimeMap(data: WorkspaceUptime | null | undefined) {
  if (!data?.available) return new Map<string, UptimeRow>();
  return new Map(data.monitored.map((row) => [row.projectId, row]));
}

export function ProjectList({ initialUptime = null }: { initialUptime?: WorkspaceUptime | null }) {
  const {
    projects,
    filter,
    healthFilter,
    deadlineFilter,
    search,
    workspaceId,
    selectedIds,
    openDrawer,
    setPriority,
    setHealth,
    setHealthFilter,
    setDeadlineFilter,
    toggleSelected,
    clearSelection,
    touchProject,
    setProgress,
  } = useProjectStore();
  const [view, setView] = useState<ProjectView>('list');
  const [uptimeByProject, setUptimeByProject] = useState<Map<string, UptimeRow>>(
    () => uptimeMap(initialUptime)
  );

  const loadUptime = useCallback(async () => {
    try {
      const data = await apiListUptime();
      if (!data.available) {
        setUptimeByProject(new Map());
        return;
      }
      setUptimeByProject(new Map(data.monitored.map((row) => [row.projectId, row])));
    } catch {
      // The list still works without chips; a failed fetch must not blank the page.
    }
  }, []);

  useEffect(() => {
    void loadUptime();
    const id = window.setInterval(() => void loadUptime(), UPTIME_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [loadUptime, workspaceId]);

  useEffect(() => {
    setView(readStoredView());
  }, []);

  const changeView = (next: ProjectView) => {
    setView(next);
    writeStoredView(next);
  };

  const filtered = useMemo(() => {
    return projects
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
  }, [projects, filter, healthFilter, deadlineFilter, search]);

  const visibleIds = filtered.map((p) => p.id);
  const hasActiveSecondaryFilter = healthFilter !== 'All' || deadlineFilter !== 'All';
  const down = [...uptimeByProject.values()].filter((row) => row.enabled && row.status === 'down');

  return (
    <div className="mt-8">
      {down.length > 0 && (
        <a
          href="/uptime"
          className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger hover:bg-danger/15"
        >
          <span className="min-w-0 truncate">
            {down.length === 1
              ? `${down[0].projectName} is down`
              : `${down.length} projects are down`}
            {down.length > 1 ? ` · ${down.map((row) => row.projectName).slice(0, 3).join(', ')}` : ''}
          </span>
          <span className="flex-shrink-0 text-xs text-danger/80">Open uptime</span>
        </a>
      )}
      <div className="flex items-end justify-between mb-3 gap-4 flex-wrap">
        <div>
          <h2 className="text-sm font-medium text-text">All projects</h2>
          <p className="text-xs text-text-dim mt-0.5">
            {filtered.length} match{filtered.length === 1 ? '' : 'es'}
            {filter !== 'All' ? ` in ${filter}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-full border border-border bg-surface-elevated p-0.5" role="group" aria-label="Project view">
            <ViewToggle active={view === 'list'} onClick={() => changeView('list')} icon={<LayoutList size={12} />} label="List" />
            <ViewToggle active={view === 'board'} onClick={() => changeView('board')} icon={<Columns size={12} />} label="Board" />
          </div>

          <FilterGroup label="Health">
            {(['All', ...HEALTH_OPTIONS] as const).map((h) => (
              <FilterChip key={h} active={healthFilter === h} onClick={() => setHealthFilter(h)}>
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
      ) : view === 'board' ? (
        <ProjectBoard
          projects={filtered}
          selectedIds={selectedIds}
          onOpen={openDrawer}
          onToggleSelected={(id, range) => toggleSelected(id, { range, visibleIds })}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              selected={selectedIds.includes(project.id)}
              uptime={uptimeByProject.get(project.id)}
              onOpen={() => openDrawer(project.id)}
              onToggle={(range) => toggleSelected(project.id, { range, visibleIds })}
              onPriority={(p) => setPriority(project.id, p)}
              onHealth={(h) => setHealth(project.id, h)}
              onTouch={() => touchProject(project.id)}
              onProgress={(value) => setProgress(project.id, value)}
            />
          ))}
        </div>
      )}

      {selectedIds.length > 0 && (
        <BulkBar
          count={selectedIds.length}
          ids={selectedIds}
          onClear={clearSelection}
        />
      )}
    </div>
  );
}

function ProjectRow({
  project,
  selected,
  uptime,
  onOpen,
  onToggle,
  onPriority,
  onHealth,
  onTouch,
  onProgress,
}: {
  project: Project;
  selected: boolean;
  uptime: UptimeRow | undefined;
  onOpen: () => void;
  onToggle: (range: boolean) => void;
  onPriority: (p: Priority) => void;
  onHealth: (h: Health) => void;
  onTouch: () => void;
  onProgress: (value: number) => void;
}) {
  const deadline = getDeadlineState(project.targetDate, project.stage);
  const rotting = isRotting(project);

  return (
    <div
      onClick={onOpen}
      className={cn(
        'group rounded-2xl border bg-surface px-4 py-3.5 cursor-pointer transition-colors',
        selected
          ? 'border-purple/50'
          : rotting
            ? 'border-warning/45 hover:border-warning/70'
            : 'border-border hover:border-purple/40'
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="checkbox"
              checked={selected}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onToggle((e.nativeEvent as MouseEvent).shiftKey)}
              aria-label={`Select ${project.name}`}
              className="rounded border-border"
            />
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
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTouch();
              }}
              aria-label={`Touch ${project.name}`}
              className="ml-auto opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 inline-flex items-center justify-center rounded-lg p-1 text-text-dim hover:text-purple-light focus:outline-none focus:ring-1 focus:ring-purple/50"
            >
              <Hand size={14} />
            </button>
          </div>
          <p className="text-sm text-text-muted truncate mt-1">{project.nextAction || 'No next action yet'}</p>
          <div className="mt-2.5" onClick={(e) => e.stopPropagation()}>
            <ProgressControl
              value={project.progress}
              onChange={onProgress}
              label={`Progress for ${project.name}`}
            />
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1">
            {(['Now', 'Next', 'Later'] as Priority[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onPriority(p)}
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
            onChange={(e) => onHealth(e.target.value as Health)}
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
          <UptimeChip row={uptime} />
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
}

function BulkBar({ count, ids, onClear }: { count: number; ids: string[]; onClear: () => void }) {
  return (
    <div className="sticky bottom-3 z-20 mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface-elevated/95 px-3 py-2 shadow-xl backdrop-blur">
      <p className="text-xs font-medium text-text tabular-nums">{count} selected</p>
      <button
        type="button"
        onClick={() => toastBatchStage(ids, 'Archived')}
        className="rounded-full bg-surface px-2.5 py-1 text-[11px] text-text-muted hover:text-text border border-border"
      >
        Archive
      </button>
      <label className="inline-flex items-center gap-1 text-[11px] text-text-dim">
        Stage
        <select
          className="rounded-full bg-surface border border-border px-2 py-1 text-[11px] text-text"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) toastBatchStage(ids, e.target.value as Stage);
            e.target.value = '';
          }}
          aria-label="Set stage for selected"
        >
          <option value="" disabled>
            Set…
          </option>
          {BOARD_STAGES.concat(['Paused', 'Archived']).map((stage) => (
            <option key={stage} value={stage}>
              {stage}
            </option>
          ))}
        </select>
      </label>
      <label className="inline-flex items-center gap-1 text-[11px] text-text-dim">
        Health
        <select
          className="rounded-full bg-surface border border-border px-2 py-1 text-[11px] text-text"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) toastBatchHealth(ids, e.target.value as Health);
            e.target.value = '';
          }}
          aria-label="Set health for selected"
        >
          <option value="" disabled>
            Set…
          </option>
          {HEALTH_OPTIONS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() => toastDelete(ids)}
        className="rounded-full bg-danger/15 px-2.5 py-1 text-[11px] text-danger hover:bg-danger/25"
      >
        Delete
      </button>
      <button type="button" onClick={onClear} className="ml-auto text-[11px] text-text-dim hover:text-text">
        Clear
      </button>
    </div>
  );
}

function ViewToggle({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px]',
        active ? 'bg-purple/20 font-medium text-purple-light' : 'text-text-dim hover:text-text'
      )}
    >
      {icon}
      {label}
    </button>
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
