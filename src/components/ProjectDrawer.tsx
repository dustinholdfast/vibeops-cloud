import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProjectStore } from '../store/useProjectStore';
import {
  formatLastTouched,
  formatFullDate,
  formatTargetDate,
  getDeadlineState,
  deadlineLabel,
  cn,
  HEALTH_OPTIONS,
  HEALTH_HELP,
} from '../lib/utils';
import type { Stage, Priority, Health } from '../types';
import { X, ExternalLink, Github, Pencil, Check, Trash2, Hand } from 'lucide-react';

const stages: Stage[] = ['Exploring', 'Building', 'Testing', 'Live', 'Paused', 'Archived'];
const priorities: Priority[] = ['Now', 'Next', 'Later'];

const stageDot: Record<Stage, string> = {
  Exploring: 'bg-blue',
  Building: 'bg-purple',
  Testing: 'bg-orange',
  Live: 'bg-success',
  Paused: 'bg-text-dim',
  Archived: 'bg-text-dim',
};

export function ProjectDrawer() {
  const {
    projects,
    selectedId,
    isDrawerOpen,
    closeDrawer,
    setPriority,
    setStage,
    setNextAction,
    setHealth,
    setTargetDate,
    setProgress,
    setLiveUrl,
    setRepoUrl,
    touchProject,
    deleteProject,
  } = useProjectStore();

  const project = projects.find((p) => p.id === selectedId);

  const [editingAction, setEditingAction] = useState(false);
  const [actionDraft, setActionDraft] = useState('');
  const [liveDraft, setLiveDraft] = useState('');
  const [repoDraft, setRepoDraft] = useState('');
  const [editingLinks, setEditingLinks] = useState(false);

  useEffect(() => {
    if (project) {
      setActionDraft(project.nextAction);
      setLiveDraft(project.liveUrl ?? '');
      setRepoDraft(project.repoUrl ?? '');
      setEditingAction(false);
      setEditingLinks(false);
    }
  }, [project?.id]);

  if (!project) return null;

  const saveAction = () => {
    if (actionDraft.trim() && actionDraft !== project.nextAction) {
      setNextAction(project.id, actionDraft.trim());
    }
    setEditingAction(false);
  };

  const saveLinks = () => {
    setLiveUrl(project.id, liveDraft.trim() || undefined);
    setRepoUrl(project.id, repoDraft.trim() || undefined);
    setEditingLinks(false);
  };

  const deadline = getDeadlineState(project.targetDate, project.stage);

  return (
    <AnimatePresence>
      {isDrawerOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeDrawer}
            className="fixed inset-0 bg-black/50 z-40"
            aria-hidden
          />

          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawer-title"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="fixed top-0 right-0 h-full w-full max-w-md bg-surface border-l border-border z-50 flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-border-subtle">
              <div className="min-w-0 flex-1">
                <h2 id="drawer-title" className="text-lg font-semibold text-text truncate">
                  {project.name}
                </h2>
                <div className="mt-1.5 h-1 w-24 rounded-full bg-border-subtle overflow-hidden">
                  <div
                    className="h-full bg-purple rounded-full"
                    style={{ width: `${project.progress}%` }}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                className="p-1.5 rounded-lg text-text-dim hover:text-text hover:bg-surface-elevated transition-colors"
                aria-label="Close project details"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
              {/* Stage */}
              <div>
                <label
                  htmlFor="drawer-stage"
                  className="text-xs font-medium text-text-dim uppercase tracking-wider"
                >
                  Stage
                </label>
                <div className="mt-2 relative">
                  <select
                    id="drawer-stage"
                    value={project.stage}
                    onChange={(e) => setStage(project.id, e.target.value as Stage)}
                    className="w-full appearance-none bg-surface-elevated border border-border rounded-lg px-3 py-2 pl-7 text-sm text-text focus:outline-none focus:border-purple/50"
                  >
                    {stages.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <span
                    className={cn(
                      'absolute left-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full pointer-events-none',
                      stageDot[project.stage]
                    )}
                    aria-hidden
                  />
                </div>
              </div>

              {/* Priority */}
              <div>
                <span className="text-xs font-medium text-text-dim uppercase tracking-wider">
                  Priority
                </span>
                <div
                  className="mt-2 flex rounded-lg overflow-hidden border border-border"
                  role="group"
                  aria-label="Priority"
                >
                  {priorities.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(project.id, p)}
                      className={cn(
                        'flex-1 py-2 text-sm font-medium transition-colors',
                        project.priority === p
                          ? 'bg-purple text-white'
                          : 'bg-surface-elevated text-text-muted hover:text-text'
                      )}
                      aria-pressed={project.priority === p}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Health */}
              <div>
                <label
                  htmlFor="drawer-health"
                  className="text-xs font-medium text-text-dim uppercase tracking-wider"
                >
                  Health
                </label>
                <select
                  id="drawer-health"
                  value={project.health}
                  onChange={(e) => setHealth(project.id, e.target.value as Health)}
                  className="mt-2 w-full appearance-none bg-surface-elevated border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-purple/50"
                >
                  {HEALTH_OPTIONS.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-text-dim leading-relaxed">
                  {HEALTH_HELP[project.health]}
                </p>
              </div>

              {/* Target date */}
              <div>
                <label
                  htmlFor="drawer-target"
                  className="text-xs font-medium text-text-dim uppercase tracking-wider"
                >
                  Target date
                </label>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    id="drawer-target"
                    type="date"
                    value={project.targetDate ?? ''}
                    onChange={(e) =>
                      setTargetDate(project.id, e.target.value || null)
                    }
                    className="flex-1 bg-surface-elevated border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-purple/50"
                  />
                  {project.targetDate && (
                    <button
                      type="button"
                      onClick={() => setTargetDate(project.id, null)}
                      className="text-xs text-text-dim hover:text-text underline"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-text-dim">
                  {deadline === 'none' ? (
                    <span className="italic">Set a target date to surface deadline signals.</span>
                  ) : (
                    <>
                      <span
                        className={cn(
                          deadline === 'overdue' && 'text-danger font-medium',
                          deadline === 'due-today' && 'text-warning font-medium',
                          deadline === 'due-soon' && 'text-orange'
                        )}
                      >
                        {deadlineLabel(deadline)}
                      </span>
                      {project.targetDate && deadline !== 'inactive' && (
                        <> · {formatTargetDate(project.targetDate)}</>
                      )}
                    </>
                  )}
                </p>
              </div>

              {/* Next action */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-text-dim uppercase tracking-wider">
                    Next action
                  </label>
                  {!editingAction && (
                    <button
                      type="button"
                      onClick={() => setEditingAction(true)}
                      className="p-1 text-text-dim hover:text-purple-light"
                      aria-label="Edit next action"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                </div>

                {editingAction ? (
                  <div className="mt-2 space-y-2">
                    <textarea
                      autoFocus
                      value={actionDraft}
                      onChange={(e) => setActionDraft(e.target.value)}
                      rows={3}
                      className="w-full bg-surface-elevated border border-purple/50 rounded-lg px-3 py-2 text-sm text-text focus:outline-none resize-none"
                      aria-label="Next action"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={saveAction}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple text-white text-sm font-medium"
                      >
                        <Check size={14} /> Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActionDraft(project.nextAction);
                          setEditingAction(false);
                        }}
                        className="px-3 py-1.5 rounded-lg text-sm text-text-muted hover:text-text"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-text bg-surface-elevated border border-border rounded-lg px-3 py-2.5">
                    {project.nextAction || (
                      <span className="text-text-dim italic">No next action defined</span>
                    )}
                  </p>
                )}

                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-xs text-text-dim">
                    Last touched {formatLastTouched(project.lastTouched)} · Created{' '}
                    {formatFullDate(project.createdAt)}
                  </p>
                  <button
                    type="button"
                    onClick={() => touchProject(project.id)}
                    className="inline-flex items-center gap-1 text-xs text-purple-light hover:underline"
                    title="Mark as touched now"
                  >
                    <Hand size={12} /> Touch
                  </button>
                </div>
              </div>

              {/* Progress — now editable */}
              <div>
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="drawer-progress"
                    className="text-xs font-medium text-text-dim uppercase tracking-wider"
                  >
                    Progress
                  </label>
                  <span className="text-sm tabular-nums text-text-muted">{project.progress}%</span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <input
                    id="drawer-progress"
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={project.progress}
                    onChange={(e) => setProgress(project.id, Number(e.target.value))}
                    className="flex-1 accent-purple h-2"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={project.progress}
                  />
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-border-subtle overflow-hidden">
                  <div
                    className="h-full bg-purple rounded-full transition-all"
                    style={{ width: `${project.progress}%` }}
                  />
                </div>
              </div>

              {/* Links — editable */}
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-text-dim uppercase tracking-wider">
                    Links
                  </span>
                  {!editingLinks && (
                    <button
                      type="button"
                      onClick={() => setEditingLinks(true)}
                      className="p-1 text-text-dim hover:text-purple-light"
                      aria-label="Edit links"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                </div>

                {editingLinks ? (
                  <div className="mt-2 space-y-2">
                    <div>
                      <label htmlFor="drawer-live" className="text-xs text-text-dim">
                        Live URL
                      </label>
                      <input
                        id="drawer-live"
                        type="url"
                        placeholder="https://…"
                        value={liveDraft}
                        onChange={(e) => setLiveDraft(e.target.value)}
                        className="mt-1 w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-purple/50"
                      />
                    </div>
                    <div>
                      <label htmlFor="drawer-repo" className="text-xs text-text-dim">
                        GitHub repo
                      </label>
                      <input
                        id="drawer-repo"
                        type="url"
                        placeholder="https://github.com/…"
                        value={repoDraft}
                        onChange={(e) => setRepoDraft(e.target.value)}
                        className="mt-1 w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-purple/50"
                      />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={saveLinks}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple text-white text-sm font-medium"
                      >
                        <Check size={14} /> Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLiveDraft(project.liveUrl ?? '');
                          setRepoDraft(project.repoUrl ?? '');
                          setEditingLinks(false);
                        }}
                        className="px-3 py-1.5 rounded-lg text-sm text-text-muted hover:text-text"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 space-y-2">
                    {project.liveUrl ? (
                      <a
                        href={project.liveUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 text-sm text-text-muted hover:text-purple-light"
                      >
                        <ExternalLink size={14} aria-hidden /> Live URL
                      </a>
                    ) : (
                      <span className="text-sm text-text-dim">No live URL</span>
                    )}
                    {project.repoUrl ? (
                      <a
                        href={project.repoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 text-sm text-text-muted hover:text-purple-light"
                      >
                        <Github size={14} aria-hidden /> GitHub repo
                      </a>
                    ) : (
                      <span className="text-sm text-text-dim">No repo URL</span>
                    )}
                  </div>
                )}
              </div>

              {/* Activity */}
              <div>
                <span className="text-xs font-medium text-text-dim uppercase tracking-wider">
                  Activity
                </span>
                <div className="mt-3 space-y-3">
                  {project.activity.length === 0 ? (
                    <p className="text-sm text-text-dim">No activity yet.</p>
                  ) : (
                    project.activity.slice(0, 8).map((item) => (
                      <div key={item.id} className="flex gap-3">
                        <div
                          className="mt-1.5 w-1.5 h-1.5 rounded-full bg-purple flex-shrink-0"
                          aria-hidden
                        />
                        <div className="min-w-0">
                          <p className="text-sm text-text">{item.message}</p>
                          <p className="text-xs text-text-dim mt-0.5">
                            {item.author && `${item.author} · `}
                            {formatLastTouched(item.timestamp)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-border-subtle flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Delete “${project.name}”?`)) {
                    deleteProject(project.id);
                  }
                }}
                className="inline-flex items-center gap-1.5 text-sm text-danger hover:text-danger/80"
              >
                <Trash2 size={14} aria-hidden /> Delete
              </button>
              <button
                type="button"
                onClick={closeDrawer}
                className="px-4 py-2 rounded-lg bg-surface-elevated border border-border text-sm text-text hover:bg-border transition-colors"
              >
                Close
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
