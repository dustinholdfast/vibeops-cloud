'use client';

import { ArrowRight, Sparkles } from 'lucide-react';
import { rankPortfolio } from '../lib/portfolio';
import { MAX_NOW_SLOTS, useProjectStore } from '../store/useProjectStore';

export function DailyBrief() {
  const { projects, openDrawer, setPriority } = useProjectStore();
  const ranked = rankPortfolio(projects);
  const recommendation = ranked[0];
  const nowCount = projects.filter((project) => project.priority === 'Now').length;
  const canClaim = recommendation?.project.priority !== 'Now' && nowCount < MAX_NOW_SLOTS;

  if (projects.length === 0 || !recommendation) return null;

  return (
    <section aria-labelledby="daily-brief-title" className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface/80 px-4 py-3">
      <div className="min-w-0 flex items-center gap-3">
        <Sparkles className="flex-shrink-0 text-purple-light" size={16} aria-hidden />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-wider text-text-dim uppercase">Recommended next</p>
          <button
            id="daily-brief-title"
            type="button"
            onClick={() => openDrawer(recommendation.project.id)}
            className="text-left text-sm font-semibold text-text hover:text-purple-light truncate"
          >
            {recommendation.project.name}
            <span className="ml-2 font-normal text-text-muted">{recommendation.project.nextAction}</span>
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {canClaim && (
          <button type="button" onClick={() => setPriority(recommendation.project.id, 'Now')} className="rounded-lg bg-purple px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-light">
            Claim Now
          </button>
        )}
        <button type="button" onClick={() => openDrawer(recommendation.project.id)} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-text-muted hover:text-text">
          Open <ArrowRight size={12} aria-hidden />
        </button>
      </div>
    </section>
  );
}
