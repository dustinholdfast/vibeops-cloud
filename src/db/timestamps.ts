import { customType } from 'drizzle-orm/pg-core';

/**
 * Drizzle types timestamptz as `Date`, but postgres.js on Workers runs with
 * `fetch_types: false`, so the driver hands back Postgres text.
 *
 * Drizzle's built-in mapper is `new Date(raw)` with no normalisation. That
 * runs inside postgres.js's socket data handler while the row is being built.
 * `new Date('2026-09-16 01:44:56.000+00')` works in V8; the same instant with
 * a `T` and `+00` (no colon) is an Invalid Date. `timestampToIso` then throws
 * `Invalid Date timestamp`, and `/api/projects` reports a generic 503.
 *
 * Passing the raw string through `normaliseTimestamp` first is what keeps
 * list/serialize and Check now working for every format we have seen on the
 * wire. Some parsers also hand back unix-ms numbers.
 */
export function timestampToDate(value: Date | string | number): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new TypeError('Invalid Date timestamp');
    }
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const fromNumber = new Date(value);
    if (!Number.isNaN(fromNumber.getTime())) return fromNumber;
  }
  if (typeof value === 'string' && value.length > 0) {
    const parsed = new Date(normaliseTimestamp(value));
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  throw new TypeError(`Unusable timestamp: ${String(value)}`);
}

export function timestampToIso(value: Date | string | number): string {
  return timestampToDate(value).toISOString();
}

export function timestampToMs(value: Date | string | number): number {
  return timestampToDate(value).getTime();
}

export function optionalTimestampToIso(
  value: Date | string | number | null | undefined
): string | null {
  return value == null ? null : timestampToIso(value);
}

/**
 * Never throw from a list mapper. One unusable drizzle Date (Invalid Date
 * after `mapFromDriverValue(new Date(postgresText))` on workerd) used to
 * 503 the whole `/api/projects` payload.
 */
export function safeTimestampToIso(value: unknown, fallback = new Date().toISOString()): string {
  try {
    if (value instanceof Date || typeof value === 'string' || typeof value === 'number') {
      return timestampToIso(value);
    }
  } catch {
    // fall through
  }
  console.error('[projects] unusable timestamp, using fallback', value);
  return fallback;
}

function normaliseTimestamp(value: string): string {
  let normalised = value.includes('T') ? value : value.replace(' ', 'T');
  // ±HHMM then ±HH — postgres omits the colon that Date requires.
  normalised = normalised.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  normalised = normalised.replace(/([+-]\d{2})$/, '$1:00');
  return normalised;
}

/**
 * Same SQL type as drizzle `timestamp(..., { withTimezone: true })`.
 * Reads go through {@link timestampToDate} so list/serialize never sees an
 * Invalid Date from the stock `new Date(raw)` mapper.
 */
export const pgTimestamptz = customType<{ data: Date; driverData: string }>({
  dataType() {
    return 'timestamp with time zone';
  },
  fromDriver(value) {
    return timestampToDate(value);
  },
  toDriver(value) {
    return timestampToDate(value).toISOString();
  },
});
