/**
 * The sidebar "Check now" path assumed drizzle timestamps were Date objects.
 * On Workers, postgres.js runs with `fetch_types: false` and hands back
 * postgres text. Calling `.getTime()` / `.toISOString()` on that string
 * throws, and the monitor routes used to report it via projectErrorResponse
 * as "Could not save or load your projects. Please try again."
 *
 * Projects already go through timestampToIso; this is the same hole on the
 * monitor read/check path.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { optionalTimestampToIso, timestampToIso, timestampToMs } from './map';
import { isWithinManualCheckCooldown, MANUAL_CHECK_COOLDOWN_MS } from './monitor-service';

const NOW = '2026-09-16T01:44:56.000Z';
const POSTGRES_TEXT = '2026-09-16 01:44:56.000+00';

describe('manual check timestamps from postgres.js fetch_types: false', () => {
  it('is the TypeError the check route used to wrap as a projects 503', () => {
    assert.throws(
      () => (POSTGRES_TEXT as unknown as Date).toISOString(),
      /toISOString is not a function/
    );
    assert.throws(
      () => (POSTGRES_TEXT as unknown as Date).getTime(),
      /getTime is not a function/
    );
  });

  it('serialises a monitor row the way toView does, without throwing', () => {
    const row = {
      lastCheckedAt: POSTGRES_TEXT as unknown as Date,
      lastStatusChangeAt: null,
    };

    assert.deepEqual(
      {
        lastCheckedAt: optionalTimestampToIso(row.lastCheckedAt),
        lastStatusChangeAt: optionalTimestampToIso(row.lastStatusChangeAt),
      },
      { lastCheckedAt: NOW, lastStatusChangeAt: null }
    );
    assert.equal(timestampToIso(POSTGRES_TEXT), NOW);
  });

  it('enforces cooldown against a string lastCheckedAt', () => {
    const lastCheckedAt = POSTGRES_TEXT;
    const justAfter = new Date(timestampToMs(lastCheckedAt) + 1_000);
    const afterCooldown = new Date(timestampToMs(lastCheckedAt) + MANUAL_CHECK_COOLDOWN_MS + 1);

    assert.equal(isWithinManualCheckCooldown(lastCheckedAt, justAfter), true);
    assert.equal(isWithinManualCheckCooldown(lastCheckedAt, afterCooldown), false);
    assert.equal(isWithinManualCheckCooldown(null, justAfter), false);
    assert.equal(isWithinManualCheckCooldown(new Date(NOW), justAfter), true);
  });
});
