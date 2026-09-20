/**
 * The one-line uptime chip shown on a project card.
 *
 * Kept pure so the list view can render without knowing how monitors are
 * stored, and so the wording ("Down" vs "99.9%") can be tested without React.
 */
import type { UptimeRow } from '../../types';

export type CardUptimeTone = 'success' | 'danger' | 'muted';

export type CardUptimeIndicator = {
  text: string;
  tone: CardUptimeTone;
  ariaLabel: string;
};

export function cardUptimeIndicator(
  row: UptimeRow | null | undefined
): CardUptimeIndicator | null {
  if (!row) return null;

  if (row.status === 'down') {
    return { text: 'Down', tone: 'danger', ariaLabel: 'Uptime: Down' };
  }

  if (!row.enabled) {
    return { text: 'Paused', tone: 'muted', ariaLabel: 'Uptime monitor paused' };
  }

  if (row.status === 'unknown') {
    return { text: '…', tone: 'muted', ariaLabel: 'Uptime: not checked yet' };
  }

  const day = row.windows.day.uptimePct;
  if (day !== null) {
    return {
      text: `${day}%`,
      tone: 'success',
      ariaLabel: `Uptime: Up, 24h ${day}%`,
    };
  }

  const month = row.windows.month.uptimePct;
  if (month !== null) {
    return {
      text: `${month}%`,
      tone: 'success',
      ariaLabel: `Uptime: Up, 30d ${month}%`,
    };
  }

  return { text: 'Up', tone: 'success', ariaLabel: 'Uptime: Up' };
}
