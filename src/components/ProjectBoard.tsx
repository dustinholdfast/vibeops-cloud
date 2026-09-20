'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { Project, Stage } from '../types';
import { useProjectStore } from '../store/useProjectStore';
import { BOARD_STAGES, PARKED_STAGES, stageColor } from '../lib/project-ui';
import { cn } from '../lib/utils';

export function ProjectBoard({
  projects,
  selectedIds,
  onOpen,
  onToggleSelected,
}: {
  projects: Project[];
  selectedIds: string[];
  onOpen: (id: string) => void;
  onToggleSelected: (id: string, range: boolean) => void;
}) {
  const setStage = useProjectStore((s) => s.setStage);
  const [over, setOver] = useState<Stage | null>(null);
  const selected = new Set(selectedIds);

  const move = (id: string, stage: Stage) => {
    const project = projects.find((p) => p.id === id) ?? useProjectStore.getState().projects.find((p) => p.id === id);
    if (!project || project.stage === stage) return;
    setStage(id, stage);
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {BOARD_STAGES.map((stage) => {
          const cards = projects.filter((p) => p.stage === stage);
          return (
            <section
              key={stage}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(stage);
              }}
              onDragLeave={() => setOver((current) => (current === stage ? null : current))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData('text/plain');
                if (id) move(id, stage);
              }}
              className={cn(
                'rounded-2xl border bg-surface/80 min-h-[180px] p-2.5 transition-colors',
                over === stage ? 'border-purple/60 bg-purple/5' : 'border-border'
              )}
            >
              <header className="flex items-center justify-between px-1.5 py-1">
                <span className="flex items-center gap-1.5 text-xs font-medium text-text">
                  <span className={cn('inline-block h-1.5 w-1.5 rounded-full', stageColor[stage])} aria-hidden />
                  {stage}
                </span>
                <span className="text-[11px] tabular-nums text-text-dim">{cards.length}</span>
              </header>
              <div className="mt-1.5 space-y-2">
                {cards.map((project) => (
                  <BoardCard
                    key={project.id}
                    project={project}
                    selected={selected.has(project.id)}
                    onOpen={onOpen}
                    onToggleSelected={onToggleSelected}
                  />
                ))}
                {cards.length === 0 && (
                  <p className="px-1.5 py-6 text-center text-[11px] text-text-dim">Drop a project here</p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border/80 bg-surface/50 px-3 py-2.5">
        <p className="text-[11px] uppercase tracking-wider text-text-dim">Parked</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {PARKED_STAGES.map((stage) => {
            const cards = projects.filter((p) => p.stage === stage);
            return (
              <div
                key={stage}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(stage);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(null);
                  const id = e.dataTransfer.getData('text/plain');
                  if (id) move(id, stage);
                }}
                className={cn(
                  'min-w-[140px] flex-1 rounded-xl border px-2.5 py-2',
                  over === stage ? 'border-purple/50' : 'border-border-subtle'
                )}
              >
                <p className="text-[11px] text-text-muted">
                  {stage} · <span className="tabular-nums">{cards.length}</span>
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {cards.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', project.id)}
                      onClick={() => onOpen(project.id)}
                      className="rounded-full border border-border bg-surface-elevated px-2 py-0.5 text-[11px] text-text-muted hover:text-text"
                    >
                      {project.name}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BoardCard({
  project,
  selected,
  onOpen,
  onToggleSelected,
}: {
  project: Project;
  selected: boolean;
  onOpen: (id: string) => void;
  onToggleSelected: (id: string, range: boolean) => void;
}) {
  return (
    <motion.div
      layout
      className={cn(
        'cursor-pointer rounded-xl border bg-surface-elevated px-2.5 py-2 text-left transition-colors',
        selected ? 'border-purple/50' : 'border-border hover:border-purple/30'
      )}
    >
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', project.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onClick={() => onOpen(project.id)}
      >
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={selected}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onToggleSelected(project.id, (e.nativeEvent as MouseEvent).shiftKey)}
            aria-label={`Select ${project.name}`}
            className="mt-0.5 rounded border-border"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text">{project.name}</p>
            <p className="mt-0.5 truncate text-[11px] text-text-muted">{project.nextAction || 'No next action'}</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
