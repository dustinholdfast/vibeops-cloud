import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bucketize, currentStreakMs, summarise, type CheckRecord } from './history';

const to = new Date('2026-09-09T12:00:00Z');
const from = new Date('2026-09-09T11:00:00Z');

function at(minutesBeforeTo: number, ok: boolean, latencyMs: number | null = 100): CheckRecord {
  return { checkedAt: new Date(to.getTime() - minutesBeforeTo * 60_000), ok, latencyMs };
}

describe('summarise', () => {
  it('reports nothing rather than zero when there are no checks', () => {
    const summary = summarise([], from, to);
    assert.equal(summary.checks, 0);
    assert.equal(summary.uptimePct, null, 'never checked is not 0% uptime');
    assert.equal(summary.avgLatencyMs, null);
  });

  it('computes uptime and average latency', () => {
    const summary = summarise(
      [at(50, true, 100), at(40, true, 200), at(30, true, 300), at(20, false, null)],
      from,
      to
    );
    assert.equal(summary.checks, 4);
    assert.equal(summary.failures, 1);
    assert.equal(summary.uptimePct, 75);
    assert.equal(summary.avgLatencyMs, 200, 'failed checks do not skew latency');
  });

  it('never rounds a window containing a failure up to 100%', () => {
    const records = [...Array(2000)].map((_, i) => at((i % 55) + 1, i !== 0));
    const summary = summarise(records, from, to);
    assert.ok(summary.uptimePct !== null && summary.uptimePct < 100);
  });

  it('ignores checks outside the window', () => {
    const summary = summarise([at(50, true), at(120, false)], from, to);
    assert.equal(summary.checks, 1);
    assert.equal(summary.uptimePct, 100);
  });
});

describe('bucketize', () => {
  it('returns the requested number of buckets, oldest first', () => {
    const buckets = bucketize([], from, to, 6);
    assert.equal(buckets.length, 6);
    assert.ok(new Date(buckets[0].start) < new Date(buckets[5].start));
  });

  it('marks empty buckets as none, not down', () => {
    const buckets = bucketize([], from, to, 4);
    assert.deepEqual(
      buckets.map((b) => b.state),
      ['none', 'none', 'none', 'none']
    );
  });

  it('separates up, degraded and down', () => {
    // Buckets are 15 minutes wide: 11:00, 11:15, 11:30, 11:45.
    const buckets = bucketize(
      [
        at(50, true), // 11:10 — up
        at(40, true), // 11:20 — degraded with the next one
        at(35, false), // 11:25
        at(20, false), // 11:40 — down
      ],
      from,
      to,
      4
    );

    assert.deepEqual(
      buckets.map((b) => b.state),
      ['up', 'degraded', 'down', 'none']
    );
    assert.equal(buckets[1].total, 2);
    assert.equal(buckets[1].failed, 1);
  });

  it('returns nothing for a zero-width or empty range', () => {
    assert.deepEqual(bucketize([], to, to, 4), []);
    assert.deepEqual(bucketize([], from, to, 0), []);
  });
});

describe('currentStreakMs', () => {
  it('is null with no history', () => {
    assert.equal(currentStreakMs([], to), null);
  });

  it('measures back to the start of the current run', () => {
    const streak = currentStreakMs([at(30, false), at(20, false), at(10, false)], to);
    assert.equal(streak, 30 * 60_000);
  });

  it('stops at the last state change', () => {
    const streak = currentStreakMs([at(40, true), at(30, false), at(10, false)], to);
    assert.equal(streak, 30 * 60_000);
  });
});
