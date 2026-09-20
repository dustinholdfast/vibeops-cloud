'use client';

import { cn } from '../lib/utils';
import { cardUptimeIndicator } from '../lib/uptime/card-indicator';
import type { UptimeRow } from '../types';

const TONE = {
  success: { dot: 'bg-success', text: 'text-success' },
  danger: { dot: 'bg-danger', text: 'text-danger' },
  muted: { dot: 'bg-text-dim', text: 'text-text-dim' },
} as const;

/**
 * Compact live status for a project card. Renders nothing when the project
 * has no monitor — the list stays quiet for everything that is not watched.
 */
export function UptimeChip({ row }: { row: UptimeRow | undefined }) {
  const indicator = cardUptimeIndicator(row);
  if (!indicator) return null;

  const tone = TONE[indicator.tone];

  return (
    <span
      className={cn('inline-flex items-center gap-1 tabular-nums', tone.text)}
      aria-label={indicator.ariaLabel}
      title={indicator.ariaLabel}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} aria-hidden />
      {indicator.text}
    </span>
  );
}
