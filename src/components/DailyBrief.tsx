'use client';

import { ArrowRight, CheckCircle2, CircleAlert, Sparkles } from 'lucide-react';
import { rankPortfolio } from '../lib/portfolio';
import { cn } from '../lib/utils';
import { MAX_NOW_SLOTS, useProjectStore } from '../store/useProjectStore';

export function DailyBrief() {
  const { projects, openDrawer, setPriority } = useProjectStore();
  const ranked = rankPortfolio(projects);
  const recommendation = ranked[0];
  const nowCount = projects.filter((project) => project.priority === 'Now').length;
  const canClaim = recommendation?.project.priority !== 'Now' && nowCount < MAX_NOW_SLOTS;

  if (projects.length === 0) {
    return (
      <section className="mb-4 rounded-xl border border-purple/30 bg-purple/5 p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 text-purple-light" size={18} aria-hidden />
          <div>
            <h2 className="text-sm font-semibold text-text">Your daily brief starts here</h2>
            <p className="mt-1 text-sm text-text-muted">
              Add a project and VibeOps will surface the work that needs your attention first.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (!recommendation) {
    return (
      <section className="mb-4 rounded-xl border border-success/30 bg-success/5 p-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 text-success" size={18} aria-hidden />
          <div>
            <h2 className="text-sm font-semibold text-text">Portfolio is clear</h2>
            <p className="mt-1 text-sm text-text-muted">
              Every project is live, paused, or archived. Start a new project when you are ready.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const urgent = recommendation.score >= 60;

  return (
    <section
      aria-labelledby="daily-brief-title"
      className={cn(
        'mb-4 rounded-xl border p-4',
        urgent ? 'border-warning/40 bg-warning/5' : 'border-purple/30 bg-purple/5'
      )}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex min-w-0 items-start gap-3">
          {urgent ? (
            <CircleAlert className="mt-0.5 flex-shrink-0 text-warning" size={18} aria-hidden />
          ) : (
            <Sparkles className="mt-0.5 flex-shrink-0 text-purple-light" size={18} aria-hidden />
          )}
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-wider text-text-dim uppercase">
              Daily brief · Recommended next
            </p>
            <button
              id="daily-brief-title"
              type="button"
              onClick={() => openDrawer(recommendation.project.id)}
              className="mt-1 break-words text-left text-base font-semibold text-text hover:text-purple-light transition-colors"
            >
              {recommendation.project.name}
            </button>
            <p className="mt-0.5 break-words text-sm text-text-muted">
              {recommendation.project.nextAction}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {recommendation.reasons.map((reason) => (
                <span
                  key={reason}
                  className="rounded-full border border-border bg-surface/70 px-2 py-0.5 text-xs text-text-muted"
                >
                  {reason}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canClaim && (
            <button
              type="button"
              onClick={() => setPriority(recommendation.project.id, 'Now')}
              className="rounded-lg bg-purple px-3 py-2 text-sm font-medium text-white hover:bg-purple-light transition-colors"
            >
              Claim for today
            </button>
          )}
          <button
            type="button"
            onClick={() => openDrawer(recommendation.project.id)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-muted hover:text-text transition-colors"
          >
            Open project <ArrowRight size={14} aria-hidden />
          </button>
        </div>
      </div>
    </section>
  );
}

