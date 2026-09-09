/**
 * When a monitor is considered down, and when that is worth an email.
 *
 * Kept pure and separate from both the network and the database: the rule that
 * decides whether somebody's phone buzzes at 3am is the part most worth being
 * able to read in one place and test exhaustively.
 */

export type MonitorStatus = 'unknown' | 'up' | 'down';

/** The result of one HTTP probe. */
export type ProbeOutcome = {
  ok: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  error: string | null;
};

export type MonitorState = {
  status: MonitorStatus;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
};

export type Transition = MonitorState & {
  /** 'down' when it has just gone down, 'up' on recovery, null while steady. */
  alert: 'down' | 'up' | null;
};

/** One bad response is usually a blip; the default waits for a second. */
export const DEFAULT_FAILURE_THRESHOLD = 2;

/** A single good response is enough to call it recovered. */
const RECOVERY_THRESHOLD = 1;

/**
 * Folds one probe result into a monitor's state.
 *
 * Alerts fire on transitions only, so a service that stays down for a day
 * produces one email rather than one per check. A monitor whose very first
 * checks fail still alerts once it crosses the threshold — being broken from
 * the moment it was added is worth knowing about.
 */
export function applyProbe(
  state: MonitorState,
  outcome: ProbeOutcome,
  failureThreshold: number = DEFAULT_FAILURE_THRESHOLD
): Transition {
  const threshold = Math.max(1, Math.floor(failureThreshold));

  if (!outcome.ok) {
    const consecutiveFailures = state.consecutiveFailures + 1;
    const goesDown = consecutiveFailures >= threshold && state.status !== 'down';

    return {
      status: goesDown ? 'down' : state.status,
      consecutiveFailures,
      consecutiveSuccesses: 0,
      alert: goesDown ? 'down' : null,
    };
  }

  const consecutiveSuccesses = state.consecutiveSuccesses + 1;
  const recovered = state.status === 'down' && consecutiveSuccesses >= RECOVERY_THRESHOLD;

  return {
    // A first-ever success settles the monitor at 'up' without an email:
    // nothing was broken, so there is nothing to announce.
    status: consecutiveSuccesses >= RECOVERY_THRESHOLD ? 'up' : state.status,
    consecutiveFailures: 0,
    consecutiveSuccesses,
    alert: recovered ? 'up' : null,
  };
}

/**
 * Whether a response counts as up. Redirects count: the checker does not follow
 * them (a redirect to a private address is exactly the thing `target.ts`
 * exists to prevent), but a service answering 301 is still answering.
 */
export function isHealthyStatus(statusCode: number): boolean {
  return statusCode >= 200 && statusCode < 400;
}

/** Whether a monitor is due, given when it last ran. */
export function isDue(
  lastCheckedAt: Date | null,
  intervalSeconds: number,
  now: Date = new Date()
): boolean {
  if (!lastCheckedAt) return true;
  return now.getTime() - lastCheckedAt.getTime() >= intervalSeconds * 1000;
}
