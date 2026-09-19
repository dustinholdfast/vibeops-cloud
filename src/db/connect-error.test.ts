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

  it('retries postgres.js close/end codes, not just the message', () => {
    assert.equal(isConnectError({ code: 'CONNECTION_CLOSED', message: '' }), true);
    assert.equal(isConnectError({ code: 'CONNECTION_ENDED' }), true);
  });

  it('retries the message-less Socket/startRead throw the live Worker logs', () => {
    const error = new Error();
    error.stack = [
      'Error',
      '    at U2 (worker.js:68858:79)',
      '    at Socket.aP (worker.js:68895:19)',
      '    at startRead (node-internal:internal_net:1527:25)',
    ].join('\n');
    assert.equal(error.message, '');
    assert.equal(isConnectError(error), true);
  });

  it('does not retry application errors', () => {
    assert.equal(isConnectError(new Error('duplicate key value violates unique constraint')), false);
    assert.equal(isConnectError({ status: 409, code: 'CONFLICT' }), false);
  });
});
