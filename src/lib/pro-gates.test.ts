import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProjectError } from './project-validation';
import { assertProGate, proGateAllows } from './pro-gates';

describe('pro gates', () => {
  it('keeps Nox, alert emails, and a second workspace on Pro', () => {
    for (const gate of ['nox', 'uptimeAlerts', 'extraWorkspace'] as const) {
      assert.equal(proGateAllows('pro', gate), true);
      assert.equal(proGateAllows('free', gate), false);
      assert.throws(() => assertProGate('free', gate), (error: unknown) => {
        return error instanceof ProjectError && error.status === 402 && error.code === 'PRO_REQUIRED';
      });
    }
  });

  it('says what Free still does for uptime', () => {
    assert.throws(
      () => assertProGate('free', 'uptimeAlerts'),
      (error: unknown) => error instanceof ProjectError && /Checks still run/.test(error.message)
    );
  });
});
