/**
 * Bound an await so a wedged Hyperdrive/postgres.js socket cannot hold the
 * Worker request (and its isolate) until workerd hang-cancels it with 1101.
 */

/** Ceiling for `GET /api/health?deep=1`. Must beat postgres.js `connect_timeout`. */
export const DEEP_HEALTH_TIMEOUT_MS = 6_000;

export class TimeoutError extends Error {
  readonly name = 'TimeoutError';
  constructor(message: string) {
    super(message);
  }
}

export async function withTimeout<T>(
  work: Promise<T> | (() => Promise<T>),
  ms: number,
  label: string
): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) {
    throw new RangeError(`withTimeout ms must be a positive number, got ${ms}`);
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  // Arm the timer before starting work so a never-settling postgres.js
  // promise cannot be the only thing on the event loop (workerd then
  // hang-cancels in a few ms with an empty log).
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new TimeoutError(`${label} timed out after ${ms}ms`));
    }, ms);
  });
  const promise = typeof work === 'function' ? work() : work;

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
