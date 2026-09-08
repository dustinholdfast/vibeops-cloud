'use client';

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
import { X, ExternalLink, Github, Pencil, Check, Trash2, Hand, MessageSquarePlus } from 'lucide-react';
import { SaveStatus } from './SaveStatus';
import { projectMomentum, type MomentumState } from '../lib/review';

const stages: Stage[] = ['Exploring', 'Building', 'Testing', 'Live', 'Paused', 'Archived'];
const priorities: Priority[] = ['Now', 'Next', 'Later'];

const MOMENTUM_LABEL: Record<MomentumState, { text: string; tone: string; help: string }> = {
  accelerating: { text: 'Accelerating', tone: 'text-success', help: 'More work landed this window than the one before.' },
  steady: { text: 'Steady', tone: 'text-text-muted', help: 'Moving at about the same pace as the window before.' },
  slowing: { text: 'Slowing', tone: 'text-warning', help: 'Less work landed this window than the one before.' },
  stalled: { text: 'Stalled', tone: 'text-text-dim', help: 'Nothing has moved in this window.' },
};

export function ProjectDrawer() {
  const {
    projects, selectedId, isDrawerOpen, closeDrawer, setPriority, setStage, setNextAction,
    setHealth, setTargetDate, setProgress, setLiveUrl, setRepoUrl, touchProject, addActivity, deleteProject,
  } = useProjectStore();

  const project = projects.find((p) => p.id === selectedId);
  const [editingAction, setEditingAction] = useState(false);
  const [actionDraft, setActionDraft] = useState('');
  const [liveDraft, setLiveDraft] = useState('');
  const [repoDraft, setRepoDraft] = useState('');
  const [editingLinks, setEditingLinks] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');

  useEffect(() => {
    if (project) {
      setActionDraft(project.nextAction);
      setLiveDraft(project.liveUrl ?? '');
      setRepoDraft(project.repoUrl ?? '');
      setEditingAction(false);
      setEditingLinks(false);
      setNoteDraft('');
    }
  }, [project?.id]);

  if (!project) return null;

  const saveAction = () => {
    if (actionDraft.trim() && actionDraft !== project.nextAction) setNextAction(project.id, actionDraft.trim());
    setEditingAction(false);
  };
  const saveLinks = () => {
    setLiveUrl(project.id, liveDraft.trim() || undefined);
    setRepoUrl(project.id, repoDraft.trim() || undefined);
    setEditingLinks(false);
  };
  const addNote = () => {
    const message = noteDraft.trim();
    if (!message) return;
    addActivity(project.id, { type: 'comment', message, author: 'You' });
    setNoteDraft('');
  };

  const deadline = getDeadlineState(project.targetDate, project.stage);
  const momentum = MOMENTUM_LABEL[projectMomentum(project).state];

  return (
    <AnimatePresence>
      {isDrawerOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeDrawer} className="fixed inset-0 bg-black/50 z-40" aria-hidden />
          <motion.aside role="dialog" aria-modal="true" aria-labelledby="drawer-title" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 320 }} className="fixed top-0 right-0 h-full w-full max-w-md bg-surface border-l border-border z-50 flex flex-col shadow-2xl">
            <div className="px-5 py-4 border-b border-border-subtle">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-text-dim">Selected project</p>
                  <h2 id="drawer-title" className="text-lg font-semibold text-text truncate">{project.name}</h2>
                </div>
                <button type="button" onClick={closeDrawer} className="p-1.5 rounded-lg text-text-dim hover:text-text hover:bg-surface-elevated" aria-label="Close project details"><X size={18} /></button>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-[11px] text-text-muted">{project.stage}</span>
                <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-[11px] text-text-muted">{project.health}</span>
                <span className="rounded-full bg-purple/15 px-2 py-0.5 text-[11px] text-purple-light">{project.priority}</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
              <SaveStatus id={project.id} />
              <div className="grid grid-cols-2 gap-3">
                <label className="rounded-xl border border-border bg-surface-elevated/60 p-3">
                  <span className="block text-[11px] uppercase tracking-wider text-text-dim">Stage</span>
                  <select id="drawer-stage" value={project.stage} onChange={(e) => setStage(project.id, e.target.value as Stage)} className="mt-1 w-full bg-transparent text-sm text-text focus:outline-none">{stages.map((s) => <option key={s} value={s}>{s}</option>)}</select>
                </label>
                <div className="rounded-xl border border-border bg-surface-elevated/60 p-3">
                  <span className="block text-[11px] uppercase tracking-wider text-text-dim">Priority</span>
                  <div className="mt-1 flex gap-1" role="group" aria-label="Priority">
                    {priorities.map((p) => (
                      <button key={p} type="button" onClick={() => setPriority(project.id, p)} aria-pressed={project.priority === p} className={cn('flex-1 rounded-md py-1 text-xs font-medium', project.priority === p ? 'bg-purple text-white' : 'text-text-muted hover:text-text')}>{p}</button>
                    ))}
                  </div>
                </div>
                <label className="rounded-xl border border-border bg-surface-elevated/60 p-3">
                  <span className="block text-[11px] uppercase tracking-wider text-text-dim">Health</span>
                  <select id="drawer-health" value={project.health} onChange={(e) => setHealth(project.id, e.target.value as Health)} className="mt-1 w-full bg-transparent text-sm text-text focus:outline-none">{HEALTH_OPTIONS.map((h) => <option key={h} value={h}>{h}</option>)}</select>
                </label>
                <label className="rounded-xl border border-border bg-surface-elevated/60 p-3">
                  <span className="block text-[11px] uppercase tracking-wider text-text-dim">Target</span>
                  <input id="drawer-target" type="date" value={project.targetDate ?? ''} onChange={(e) => setTargetDate(project.id, e.target.value || null)} className="mt-1 w-full bg-transparent text-sm text-text focus:outline-none" />
                  <p className="mt-1 text-[11px] text-text-dim">{deadline === 'none' ? 'No date' : `${deadlineLabel(deadline)}${project.targetDate ? ' \u00b7 ' + formatTargetDate(project.targetDate) : ''}`}</p>
                </label>
              </div>
              <p className="text-xs text-text-dim -mt-2">{HEALTH_HELP[project.health]}</p>
              <div className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="drawer-progress" className="text-[11px] uppercase tracking-wider text-text-dim">Progress</label>
                  <span className="text-sm tabular-nums text-text">{project.progress}%</span>
                </div>
                <input id="drawer-progress" type="range" min={0} max={100} step={5} value={project.progress} onChange={(e) => setProgress(project.id, Number(e.target.value))} className="mt-2 w-full accent-purple" />
                <div className="mt-1 h-1.5 rounded-full bg-border-subtle overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-purple to-blue" style={{ width: `${project.progress}%` }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-wider text-text-dim">Next action</span>
                  {!editingAction && <button type="button" onClick={() => setEditingAction(true)} className="p-1 text-text-dim hover:text-purple-light" aria-label="Edit next action"><Pencil size={14} /></button>}
                </div>
                {editingAction ? (
                  <div className="mt-2 space-y-2">
                    <textarea autoFocus value={actionDraft} onChange={(e) => setActionDraft(e.target.value)} rows={3} className="w-full bg-surface-elevated border border-purple/50 rounded-lg px-3 py-2 text-sm text-text focus:outline-none resize-none" aria-label="Next action" />
                    <div className="flex gap-2">
                      <button type="button" onClick={saveAction} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple text-white text-sm font-medium"><Check size={14} /> Save</button>
                      <button type="button" onClick={() => { setActionDraft(project.nextAction); setEditingAction(false); }} className="px-3 py-1.5 text-sm text-text-muted">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-text rounded-xl border border-border bg-surface-elevated/60 px-3 py-2.5">{project.nextAction || <span className="text-text-dim italic">No next action defined</span>}</p>
                )}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-xs text-text-dim">Last touched {formatLastTouched(project.lastTouched)}</p>
                  <button type="button" onClick={() => touchProject(project.id)} className="inline-flex items-center gap-1 text-xs text-purple-light hover:underline"><Hand size={12} /> Touch</button>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-wider text-text-dim">Links</span>
                  {!editingLinks && <button type="button" onClick={() => setEditingLinks(true)} className="p-1 text-text-dim hover:text-purple-light" aria-label="Edit links"><Pencil size={14} /></button>}
                </div>
                {editingLinks ? (
                  <div className="mt-2 space-y-2">
                    <input type="url" placeholder="Live URL" value={liveDraft} onChange={(e) => setLiveDraft(e.target.value)} className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-purple/50" />
                    <input type="url" placeholder="GitHub repo" value={repoDraft} onChange={(e) => setRepoDraft(e.target.value)} className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-purple/50" />
                    <div className="flex gap-2">
                      <button type="button" onClick={saveLinks} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple text-white text-sm font-medium"><Check size={14} /> Save</button>
                      <button type="button" onClick={() => { setLiveDraft(project.liveUrl ?? ''); setRepoDraft(project.repoUrl ?? ''); setEditingLinks(false); }} className="px-3 py-1.5 text-sm text-text-muted">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {project.liveUrl ? <a href={project.liveUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm text-text hover:border-purple/40"><ExternalLink size={14} /> Live</a> : <span className="rounded-xl border border-dashed border-border px-3 py-2 text-sm text-text-dim text-center">No live URL</span>}
                    {project.repoUrl ? <a href={project.repoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm text-text hover:border-purple/40"><Github size={14} /> Repo</a> : <span className="rounded-xl border border-dashed border-border px-3 py-2 text-sm text-text-dim text-center">No repo</span>}
                  </div>
                )}
              </div>
              <div>
                <label htmlFor="drawer-note" className="text-[11px] uppercase tracking-wider text-text-dim">Add note</label>
                <div className="mt-2 flex gap-2">
                  <input id="drawer-note" value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addNote(); }} placeholder="What happened?" className="flex-1 bg-surface-elevated border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-purple/50" />
                  <button type="button" onClick={addNote} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm text-text-muted hover:text-text"><MessageSquarePlus size={14} /></button>
                </div>
              </div>
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] uppercase tracking-wider text-text-dim">Activity</span>
                  <span className={cn('text-xs', momentum.tone)} title={momentum.help}>{momentum.text}</span>
                </div>
                <div className="mt-3 space-y-3">
                  {project.activity.length === 0 ? <p className="text-sm text-text-dim">No activity yet.</p> : project.activity.slice(0, 8).map((item) => (
                    <div key={item.id} className="flex gap-3">
                      <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-purple flex-shrink-0" aria-hidden />
                      <div className="min-w-0">
                        <p className="text-sm text-text">{item.message}</p>
                        <p className="text-xs text-text-dim mt-0.5">{item.author && `${item.author} \u00b7 `}{formatLastTouched(item.timestamp)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-border-subtle flex items-center justify-between">
              <button type="button" onClick={() => { if (confirm('Delete this project?')) void deleteProject(project.id); }} className="inline-flex items-center gap-1.5 text-sm text-danger hover:text-danger/80"><Trash2 size={14} /> Delete</button>
              <button type="button" onClick={closeDrawer} className="px-4 py-2 rounded-lg bg-surface-elevated border border-border text-sm text-text">Close</button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
