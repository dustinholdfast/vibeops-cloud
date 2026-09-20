import { differenceInCalendarDays, startOfDay, subDays } from 'date-fns';
import type { Project } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

function dayIndex(iso: string, start: Date, days: number): number | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const idx = differenceInCalendarDays(startOfDay(at), start);
  if (idx < 0 || idx >= days) return null;
  return idx;
}

/**
 * Counts local-calendar activity for the last `days` days (oldest → newest).
 * Each activity timestamp and each project's lastTouched contribute one mark.
 */
export function activitySeries(
  projects: Project[],
  days = 14,
  now: Date = new Date()
): number[] {
  const series = Array.from({ length: days }, () => 0);
  const start = startOfDay(subDays(now, days - 1));
  for (const project of projects) {
    for (const item of project.activity) {
      const idx = dayIndex(item.timestamp, start, days);
      if (idx !== null) series[idx] += 1;
    }
    const touched = dayIndex(project.lastTouched, start, days);
    if (touched !== null) series[touched] += 1;
  }
  return series;
}

export function sparklinePoints(series: number[], width: number, height: number): string {
  if (series.length === 0) return '';
  const max = Math.max(1, ...series);
  const step = series.length === 1 ? 0 : width / (series.length - 1);
  return series
    .map((value, i) => {
      const x = i * step;
      const y = height - (value / max) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export { DAY_MS };
