/**
 * Turns raw check rows into the numbers and bars the dashboard shows.
 *
 * Pure so the arithmetic behind "99.4% uptime" can be tested directly, and so
 * the same functions serve the API, the email and the UI.
 */

export type CheckRecord = {
  checkedAt: Date;
  ok: boolean;
  latencyMs: number | null;
};

export type BucketState = 'none' | 'up' | 'degraded' | 'down';

export type Bucket = {
  /** Start of the bucket, inclusive. */
  start: string;
  /** End of the bucket, exclusive. */
  end: string;
  total: number;
  failed: number;
  state: BucketState;
};

export type UptimeSummary = {
  checks: number;
  failures: number;
  /** Null when nothing has been checked yet — not the same as 0%. */
  uptimePct: number | null;
  avgLatencyMs: number | null;
};

function windowed(records: CheckRecord[], from: Date, to: Date): CheckRecord[] {
  return records.filter(
    (record) => record.checkedAt >= from && record.checkedAt < to
  );
}

/** Uptime and latency over a window. */
export function summarise(
  records: CheckRecord[],
  from: Date,
  to: Date = new Date()
): UptimeSummary {
  const inWindow = windowed(records, from, to);
  const checks = inWindow.length;

  if (checks === 0) {
    return { checks: 0, failures: 0, uptimePct: null, avgLatencyMs: null };
  }

  const failures = inWindow.filter((record) => !record.ok).length;

  // Latency is only meaningful for responses that actually came back.
  const latencies = inWindow
    .filter((record) => record.ok && typeof record.latencyMs === 'number')
    .map((record) => record.latencyMs as number);

  const avgLatencyMs = latencies.length
    ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
    : null;

  return {
    checks,
    failures,
    // One decimal place: "99.9%" is the useful precision, and rounding up to a
    // clean 100% while a failure sits in the window would be a lie.
    uptimePct: Math.floor(((checks - failures) / checks) * 1000) / 10,
    avgLatencyMs,
  };
}

/**
 * Splits a window into equal buckets for the status bar strip. Buckets run
 * oldest to newest so the strip reads left to right like a timeline.
 */
export function bucketize(
  records: CheckRecord[],
  from: Date,
  to: Date,
  count: number
): Bucket[] {
  const buckets: Bucket[] = [];
  const span = to.getTime() - from.getTime();
  if (span <= 0 || count <= 0) return buckets;

  const width = span / count;

  for (let index = 0; index < count; index += 1) {
    const start = new Date(from.getTime() + index * width);
    const end = new Date(from.getTime() + (index + 1) * width);
    const inBucket = windowed(records, start, end);
    const failed = inBucket.filter((record) => !record.ok).length;

    let state: BucketState = 'none';
    if (inBucket.length > 0) {
      if (failed === 0) state = 'up';
      else if (failed === inBucket.length) state = 'down';
      else state = 'degraded';
    }

    buckets.push({
      start: start.toISOString(),
      end: end.toISOString(),
      total: inBucket.length,
      failed,
      state,
    });
  }

  return buckets;
}

/** How long the monitor has been in its current state, in ms, or null. */
export function currentStreakMs(
  records: CheckRecord[],
  now: Date = new Date()
): number | null {
  if (records.length === 0) return null;

  const newestFirst = [...records].sort(
    (a, b) => b.checkedAt.getTime() - a.checkedAt.getTime()
  );

  const latest = newestFirst[0];
  let since = latest.checkedAt;

  for (const record of newestFirst) {
    if (record.ok !== latest.ok) break;
    since = record.checkedAt;
  }

  return now.getTime() - since.getTime();
}
