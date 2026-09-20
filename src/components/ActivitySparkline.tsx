'use client';

import { useMemo } from 'react';
import { activitySeries, sparklinePoints } from '../lib/activity-sparkline';
import { cn } from '../lib/utils';
import type { Project } from '../types';

const DAYS = 14;

export function ActivitySparkline({ projects }: { projects: Project[] }) {
  const series = useMemo(() => activitySeries(projects, DAYS), [projects]);
  const total = series.reduce((sum, n) => sum + n, 0);
  const max = Math.max(1, ...series);
  const points = sparklinePoints(series, 112, 28);

  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-dim">Activity</p>
      <div className="mt-1.5 flex items-end gap-3">
        <svg width="112" height="28" viewBox="0 0 112 28" className="flex-shrink-0 text-purple-light" aria-hidden>
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={points}
          />
        </svg>
        <div className="flex gap-[3px]" role="img" aria-label={`Activity over the last ${DAYS} days, ${total} events`}>
          {series.map((count, i) => {
            const intensity = count === 0 ? 0 : 0.2 + (count / max) * 0.8;
            return (
              <span
                key={i}
                title={`${count} event${count === 1 ? '' : 's'}`}
                className={cn('h-3.5 w-2.5 rounded-[3px]', count === 0 ? 'bg-border-subtle' : 'bg-purple')}
                style={count === 0 ? undefined : { opacity: intensity }}
              />
            );
          })}
        </div>
      </div>
      <p className="mt-1 text-[11px] tabular-nums text-text-dim">{total} marks · {DAYS}d</p>
    </div>
  );
}
