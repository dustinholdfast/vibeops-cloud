import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TimeoutError, withTimeout } from './timeout';

describe('withTimeout', () => {
  it('resolves when the work finishes in time', async () => {
    assert.equal(await withTimeout(Promise.resolve('ok'), 50, 'probe'), 'ok');
  });

  it('rejects with TimeoutError when the work never settles', async () => {
    const hung = new Promise<void>(() => {});
    await assert.rejects(() => withTimeout(hung, 20, 'monitorStorageReady'), (error: unknown) => {
      assert.ok(error instanceof TimeoutError);
      assert.match(error.message, /monitorStorageReady timed out after 20ms/);
      return true;
    });
  });

  it('does not swallow a real failure that lands first', async () => {
    await assert.rejects(
      () => withTimeout(Promise.reject(new Error('socket dead')), 50, 'probe'),
      /socket dead/
    );
  });

  it('accepts a thunk so the timer is armed before the work starts', async () => {
    let started = false;
    const result = await withTimeout(
      async () => {
        started = true;
        return 7;
      },
      50,
      'thunk'
    );
    assert.equal(started, true);
    assert.equal(result, 7);
  });
});
