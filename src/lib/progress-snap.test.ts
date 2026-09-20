import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { progressFromClientX, snapProgress } from './progress-snap';

describe('snapProgress', () => {
  it('snaps to the nearest 10% step and clamps', () => {
    assert.equal(snapProgress(0), 0);
    assert.equal(snapProgress(4), 0);
    assert.equal(snapProgress(5), 10);
    assert.equal(snapProgress(14), 10);
    assert.equal(snapProgress(15), 20);
    assert.equal(snapProgress(94), 90);
    assert.equal(snapProgress(95), 100);
    assert.equal(snapProgress(100), 100);
    assert.equal(snapProgress(-20), 0);
    assert.equal(snapProgress(140), 100);
    assert.equal(snapProgress(Number.NaN), 0);
  });
});

describe('progressFromClientX', () => {
  it('maps a click on the bar to a snapped percent', () => {
    const rect = { left: 0, width: 200 } as DOMRect;
    assert.equal(progressFromClientX(0, rect), 0);
    assert.equal(progressFromClientX(100, rect), 50);
    assert.equal(progressFromClientX(30, rect), 20);
  });
});
