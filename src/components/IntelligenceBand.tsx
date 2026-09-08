'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, Moon, Rocket, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { rankPortfolio } from '../lib/portfolio';
import { buildPortfolioReview, REVIEW_WINDOW_DAYS, type PortfolioReview } from '../lib/review';
import { MAX_NOW_SLOTS, useProjectStore } from '../store/useProjectStore';
import { cn } from '../lib/utils';
import type { Project } from '../types';

const WINDOW_OPTIONS = [REVIEW_WINDOW_DAYS, 14, 30];

export function IntelligenceBand() {
  const projects = useProjectStore((s) => s.projects);
  const openDrawer = useProjectStore((s) => s.openDrawer);
  const setPriority = useProjectStore((s) => s.setPriority);
  const [expanded, setExpanded] = useState(false);
  const [windowDays, setWindowDays] = useState(REVIEW_WINDOW_DAYS);

  const recommendation = useMemo(() => rankPortfolio(projects)[0], [projects]);
  const review = useMemo(
    () => buildPortfolioReview(projects, new Date(), windowDays),
    [projects, windowDays]
  );

  if (projects.length === 0 || !recommendation) return null;

  const nowCount = projects.filter((project) => project.priority === 'Now').length;
  const canClaim = recommendation.project.priority !== 'Now' && nowCount < MAX_NOW_SLOTS;
  const why = recommendation.reasons[0];

  return (
    <section aria-label="Portfolio intelligence" className="mb-5 rounded-2xl border border-border bg-surface overflow-hidden">
      <div className="grid gap-4 px-4 py-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-center">
        <div className="min-w-0 flex items-start gap-3">
          <Sparkles className="mt-0.5 flex-shrink-0 text-purple-light" size={16} aria-hidden />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-dim">Today</p>
            <button
              type="button"
              onClick={() => openDrawer(recommendation.project.id)}
              className="mt-0.5 block max-w-full truncate text-left text-sm font-semibold text-text hover:text-purple-light"
            >
              {recommendation.project.name}
            </button>
            <p className="mt-0.5 truncate text-xs text-text-muted">
              {why}
              {recommendation.project.nextAction ? ` · ${recommendation.project.nextAction}` : ''}
            </p>
            <div className="mt-2 flex items-center gap-2">
              {canClaim && (
                <button
                  type="button"
                  onClick={() => setPriority(recommendation.project.id, 'Now')}
                  className="rounded-lg bg-purple px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-light"
                >
                  Claim Now
                </button>
              )}
              <button
                type="button"
                onClick={() => openDrawer(recommendation.project.id)}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-text-muted hover:text-text"
              >
                Open <ArrowRight size={12} aria-hidden />
              </button>
            </div>
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-dim">
              Review
            </p>
            <div className="flex items-center gap-1.5">
              <div className="flex rounded-full border border-border bg-surface-elevated p-0.5" role="group" aria-label="Review window">
                {WINDOW_OPTIONS.map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setWindowDays(days)}
                    aria-pressed={windowDays === days}
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[11px] tabular-nums',
                      windowDays === days
                        ? 'bg-purple/20 font-medium text-purple-light'
                        : 'text-text-dim hover:text-text'
                    )}
                  >
                    {days}d
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setExpanded((open) => !open)}
                aria-expanded={expanded}
                className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-text-muted hover:text-text"
              >
                {expanded ? 'Hide' : 'Details'}
                <ChevronDown size={12} className={cn(expanded && 'rotate-180')} aria-hidden />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            <CountTile label="Shipped" value={review.shipped.length} tone="text-success" onClick={() => setExpanded(true)} />
            <CountTile label="Advanced" value={review.advanced.length} tone="text-purple-light" onClick={() => setExpanded(true)} />
            <CountTile label="Slipped" value={review.slipped.length} tone="text-warning" onClick={() => setExpanded(true)} />
            <CountTile label="Stalled" value={review.stalled.length} tone="text-text-muted" onClick={() => setExpanded(true)} />
          </div>
        </div>
      </div>

      {expanded && <ReviewDetails review={review} onOpen={openDrawer} />}
    </section>
  );
}

function CountTile({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  tone: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-border bg-surface-elevated px-2 py-2 text-left hover:border-purple/30"
    >
      <p className={cn('text-lg font-semibold tabular-nums leading-none', tone)}>{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-wider text-text-dim">{label}</p>
    </button>
  );
}

function ReviewDetails({
  review,
  onOpen,
}: {
  review: PortfolioReview;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="border-t border-border-subtle px-4 py-3">
      <p className="mb-3 text-sm text-text-muted">{review.headline}</p>
      <div className="flex flex-wrap gap-x-6 gap-y-4">
        <Bucket label="Shipped" tone="text-success" icon={<Rocket size={13} />} projects={review.shipped} onOpen={onOpen} />
        <Bucket label="Advanced" tone="text-purple-light" icon={<TrendingUp size={13} />} projects={review.advanced} onOpen={onOpen} />
        <Bucket label="Slipped" tone="text-warning" icon={<TrendingDown size={13} />} projects={review.slipped} onOpen={onOpen} />
        <Bucket
          label="Stalled"
          tone="text-text-muted"
          icon={<Moon size={13} />}
          projects={review.stalled.map((entry) => entry.project)}
          note={(project) => review.stalled.find((entry) => entry.project.id === project.id)?.staleDays + 'd'}
          onOpen={onOpen}
        />
      </div>
      {review.timeline.length > 0 && (
        <ul className="mt-4 space-y-1.5 border-t border-border-subtle pt-3">
          {review.timeline.slice(0, 8).map((entry) => (
            <li key={`${entry.project.id}-${entry.item.id}`} className="flex gap-2 text-xs">
              <span className="w-24 flex-shrink-0 text-right tabular-nums text-text-dim">
                {formatDistanceToNow(entry.at, { addSuffix: true })}
              </span>
              <button
                type="button"
                onClick={() => onOpen(entry.project.id)}
                className="flex-shrink-0 font-medium text-purple-light hover:underline"
              >
                {entry.project.name}
              </button>
              <span className="min-w-0 flex-1 truncate text-text-muted">{entry.item.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Bucket({
  label,
  tone,
  icon,
  projects,
  note,
  onOpen,
}: {
  label: string;
  tone: string;
  icon: React.ReactNode;
  projects: Project[];
  note?: (project: Project) => string | undefined;
  onOpen: (id: string) => void;
}) {
  if (projects.length === 0) return null;
  return (
    <div className="min-w-[140px] flex-1">
      <div className={cn('flex items-center gap-1.5 text-[11px] font-medium', tone)}>
        {icon}
        <span>
          {label} · <span className="tabular-nums">{projects.length}</span>
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {projects.map((project) => (
          <button
            key={project.id}
            type="button"
            onClick={() => onOpen(project.id)}
            className="rounded-full border border-border bg-surface-elevated px-2 py-0.5 text-[11px] text-text-muted hover:text-text"
          >
            {project.name}
            {note?.(project) ? <span className="ml-1 text-text-dim">{note(project)}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
