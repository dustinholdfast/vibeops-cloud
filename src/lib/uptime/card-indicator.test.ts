import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { UptimeRow, UptimeWindow } from '../../types';
import { cardUptimeIndicator } from './card-indicator';

const window = (uptimePct: number | null): UptimeWindow => ({
  checks: uptimePct === null ? 0 : 10,
  failures: 0,
  uptimePct,
  avgLatencyMs: 80,
});

function row(overrides: Partial<UptimeRow> = {}): UptimeRow {
  return {
    projectId: 'p1',
    projectName: 'Riftdweller',
    url: 'https://example.com',
    status: 'up',
    enabled: true,
    lastCheckedAt: '2026-09-19T12:00:00.000Z',
    lastError: null,
    intervalSeconds: 300,
    windows: {
      day: window(100),
      week: window(99.8),
      month: window(99.9),
    },
    buckets: [],
    ...overrides,
  };
}

describe('cardUptimeIndicator', () => {
  it('returns null when the project has no monitor', () => {
    assert.equal(cardUptimeIndicator(undefined), null);
    assert.equal(cardUptimeIndicator(null), null);
  });

  it('shows Down when the monitor is down', () => {
    const indicator = cardUptimeIndicator(row({ status: 'down' }));
    assert.deepEqual(indicator, {
      text: 'Down',
      tone: 'danger',
      ariaLabel: 'Uptime: Down',
    });
  });

  it('prefers Down over the uptime percentage', () => {
    const indicator = cardUptimeIndicator(
      row({
        status: 'down',
        windows: {
          day: window(90),
          week: window(95),
          month: window(99.1),
        },
      })
    );
    assert.equal(indicator?.text, 'Down');
    assert.equal(indicator?.tone, 'danger');
  });

  it('shows the 24h percentage when the monitor is up', () => {
    const indicator = cardUptimeIndicator(row({ status: 'up' }));
    assert.deepEqual(indicator, {
      text: '100%',
      tone: 'success',
      ariaLabel: 'Uptime: Up, 24h 100%',
    });
  });

  it('falls back to 30d when 24h has no checks yet', () => {
    const indicator = cardUptimeIndicator(
      row({
        status: 'up',
        windows: {
          day: window(null),
          week: window(null),
          month: window(99.9),
        },
      })
    );
    assert.equal(indicator?.text, '99.9%');
    assert.equal(indicator?.ariaLabel, 'Uptime: Up, 30d 99.9%');
  });

  it('shows Up when there is no percentage yet', () => {
    const indicator = cardUptimeIndicator(
      row({
        status: 'up',
        windows: {
          day: window(null),
          week: window(null),
          month: window(null),
        },
      })
    );
    assert.deepEqual(indicator, {
      text: 'Up',
      tone: 'success',
      ariaLabel: 'Uptime: Up',
    });
  });

  it('shows that a new monitor has not been checked yet', () => {
    const indicator = cardUptimeIndicator(row({ status: 'unknown' }));
    assert.deepEqual(indicator, {
      text: '…',
      tone: 'muted',
      ariaLabel: 'Uptime: not checked yet',
    });
  });

  it('shows Paused when the monitor is disabled', () => {
    const indicator = cardUptimeIndicator(row({ enabled: false, status: 'up' }));
    assert.deepEqual(indicator, {
      text: 'Paused',
      tone: 'muted',
      ariaLabel: 'Uptime monitor paused',
    });
  });

  it('still reports Down when a paused monitor is down', () => {
    const indicator = cardUptimeIndicator(row({ enabled: false, status: 'down' }));
    assert.equal(indicator?.text, 'Down');
    assert.equal(indicator?.tone, 'danger');
  });
});
