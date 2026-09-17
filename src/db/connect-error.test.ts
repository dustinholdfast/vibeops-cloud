import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isConnectError } from './index';

describe('isConnectError', () => {
  it('matches the postgres.js timeout the live Worker currently logs', () => {
    assert.equal(
      isConnectError(
        new Error('write CONNECT_TIMEOUT ep-still-silence-axg6svao-pooler.c-4.us-east-2.aws.neon.tech:5432')
      ),
      true
    );
  });

  it('does not retry application errors', () => {
    assert.equal(isConnectError(new Error('duplicate key value violates unique constraint')), false);
    assert.equal(isConnectError({ status: 409, code: 'CONFLICT' }), false);
  });
});
