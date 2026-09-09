'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Rocket, TrendingUp, TrendingDown, Moon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { buildPortfolioReview, REVIEW_WINDOW_DAYS } from '../lib/review';
import type { PortfolioReview } from '../lib/review';
import { cn } from '../lib/utils';
import type { Project } from '../types';
import { useProjectStore } from '../store/useProjectStore';

const WINDOW_OPTIONS = [REVIEW_WINDOW_DAYS, 14, 30];
const TIMELINE_LIMIT = 12;

type GroupProps = {
  label: string;
  tone: string;
  icon: React.ReactNode;
  projects: Project[];
  note?: (project: Project) => string | undefined;
  onOpen: (id: string) => void;
};

function Group({ label, tone, icon, projects, note, onOpen }: GroupProps) {
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
            className="rounded-full border border-border bg-surface-elevated px-2 py-0.5 text-[11px] text-text-muted transition-colors hover:border-purple/40 hover:text-text"
          >
            {project.name}
            {note?.(project) && <span className="ml-1 text-text-dim">{note(project)}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function Timeline({ review, onOpen }: { review: PortfolioReview; onOpen: (id: string) => void }) {
  if (review.timeline.length === 0) return null;
  const shown = review.timeline.slice(0, TIMELINE_LIMIT);

  return (
    <div className="mt-4 border-t border-border-subtle pt-3">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-text-dim">Activity</h4>
      <ul className="mt-2 space-y-1.5">
        {shown.map((entry) => (
          <li key={`${entry.project.id}-${entry.item.id}`} className="flex gap-2 text-xs">
            <span className="w-20 flex-shrink-0 text-right tabular-nums text-text-dim">
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
      {review.timeline.length > shown.length && (
        <p className="mt-2 text-xs text-text-dim">+{review.timeline.length - shown.length} more in this window</p>
      )}
    </div>
  );
}

export function WeeklyReview() {
  const projects = useProjectStore((s) => s.projects);
  const openDrawer = useProjectStore((s) => s.openDrawer);
  const [expanded, setExpanded] = useState(false);
  const [windowDays, setWindowDays] = useState(REVIEW_WINDOW_DAYS);

  const review = useMemo(
    () => buildPortfolioReview(projects, new Date(), windowDays),
    [projects, windowDays]
  );

  if (projects.length === 0) return null;

  return (
    <section aria-labelledby="review-title" className="mt-5 rounded-2xl border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 id="review-title" className="text-[11px] font-semibold uppercase tracking-wider text-text-dim">
            Review · last {windowDays} days
          </h3>
          <p className="mt-0.5 text-sm text-text truncate">{review.headline}</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-full border border-border bg-surface-elevated p-0.5" role="group" aria-label="Review window">
            {WINDOW_OPTIONS.map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setWindowDays(days)}
                aria-pressed={windowDays === days}
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] tabular-nums transition-colors',
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
            aria-controls="review-detail"
            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-elevated px-2.5 py-1 text-[11px] text-text-muted hover:text-text"
          >
            {expanded ? 'Hide' : 'Details'}
            <ChevronDown size={13} aria-hidden className={cn('transition-transform', expanded && 'rotate-180')} />
          </button>
        </div>
      </div>

      {expanded && (
        <div id="review-detail" className="mt-4">
          <div className="flex flex-wrap gap-x-6 gap-y-4">
            <Group label="Shipped" tone="text-success" icon={<Rocket size={13} aria-hidden />} projects={review.shipped} onOpen={openDrawer} />
            <Group label="Advanced" tone="text-purple-light" icon={<TrendingUp size={13} aria-hidden />} projects={review.advanced} onOpen={openDrawer} />
            <Group label="Slipped" tone="text-warning" icon={<TrendingDown size={13} aria-hidden />} projects={review.slipped} onOpen={openDrawer} />
            <Group
              label="Stalled"
              tone="text-text-muted"
              icon={<Moon size={13} aria-hidden />}
              projects={review.stalled.map((entry) => entry.project)}
              note={(project) => {
                const match = review.stalled.find((entry) => entry.project.id === project.id);
                return match ? `${match.staleDays}d` : undefined;
              }}
              onOpen={openDrawer}
            />
          </div>

          {review.timeline.length === 0 && (
            <p className="text-sm text-text-muted">
              No recorded activity in this window. Edits you make from here on will show up.
            </p>
          )}

          <Timeline review={review} onOpen={openDrawer} />
        </div>
      )}
    </section>
  );
}
