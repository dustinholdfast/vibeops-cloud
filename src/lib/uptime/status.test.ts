import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyProbe,
  isDue,
  isHealthyStatus,
  type MonitorState,
  type ProbeOutcome,
} from './status';

const fresh: MonitorState = {
  status: 'unknown',
  consecutiveFailures: 0,
  consecutiveSuccesses: 0,
};

const good: ProbeOutcome = { ok: true, statusCode: 200, latencyMs: 120, error: null };
const bad: ProbeOutcome = { ok: false, statusCode: 500, latencyMs: 90, error: null };

describe('applyProbe', () => {
  it('settles a new monitor at up without emailing anyone', () => {
    const next = applyProbe(fresh, good);
    assert.equal(next.status, 'up');
    assert.equal(next.alert, null);
  });

  it('waits for the threshold before calling it down', () => {
    const first = applyProbe({ ...fresh, status: 'up' }, bad, 2);
    assert.equal(first.status, 'up', 'one bad response is a blip');
    assert.equal(first.alert, null);
    assert.equal(first.consecutiveFailures, 1);

    const second = applyProbe(first, bad, 2);
    assert.equal(second.status, 'down');
    assert.equal(second.alert, 'down');
    assert.equal(second.consecutiveFailures, 2);
  });

  it('alerts once and stays quiet while it remains down', () => {
    let state = applyProbe({ ...fresh, status: 'up' }, bad, 1);
    assert.equal(state.alert, 'down');

    for (let i = 0; i < 5; i += 1) {
      state = applyProbe(state, bad, 1);
      assert.equal(state.alert, null, 'no repeat alerts while down');
      assert.equal(state.status, 'down');
    }
  });

  it('alerts on recovery', () => {
    const down = applyProbe({ ...fresh, status: 'up' }, bad, 1);
    const recovered = applyProbe(down, good, 1);

    assert.equal(recovered.status, 'up');
    assert.equal(recovered.alert, 'up');
    assert.equal(recovered.consecutiveFailures, 0);
  });

  it('alerts for a monitor that was broken from the moment it was added', () => {
    const first = applyProbe(fresh, bad, 2);
    assert.equal(first.alert, null);

    const second = applyProbe(first, bad, 2);
    assert.equal(second.status, 'down');
    assert.equal(second.alert, 'down');
  });

  it('resets the failure run after any success', () => {
    const shaky = applyProbe({ ...fresh, status: 'up' }, bad, 3);
    const better = applyProbe(shaky, good, 3);
    assert.equal(better.consecutiveFailures, 0);
    assert.equal(better.alert, null, 'it never went down, so nothing recovered');
  });

  it('treats a threshold below one as one', () => {
    const next = applyProbe({ ...fresh, status: 'up' }, bad, 0);
    assert.equal(next.status, 'down');
    assert.equal(next.alert, 'down');
  });
});

describe('isHealthyStatus', () => {
  it('counts 2xx and 3xx as up, 4xx and 5xx as down', () => {
    for (const code of [200, 204, 301, 302, 399]) {
      assert.equal(isHealthyStatus(code), true, String(code));
    }
    for (const code of [400, 404, 429, 500, 503]) {
      assert.equal(isHealthyStatus(code), false, String(code));
    }
  });
});

describe('isDue', () => {
  const now = new Date('2026-09-09T12:00:00Z');

  it('is always due when it has never run', () => {
    assert.equal(isDue(null, 300, now), true);
  });

  it('waits out the interval', () => {
    assert.equal(isDue(new Date('2026-09-09T11:58:00Z'), 300, now), false);
    assert.equal(isDue(new Date('2026-09-09T11:55:00Z'), 300, now), true);
    assert.equal(isDue(new Date('2026-09-09T11:50:00Z'), 300, now), true);
  });
});
