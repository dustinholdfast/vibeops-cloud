import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  dbCacheKind,
  isConnectError,
  isMissingRelationError,
  shouldResetIsolateOnStorageError,
} from './index';

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

  it('retries a mid-read drop whose message is the only signal', () => {
    assert.equal(isConnectError(new Error('CONNECTION_ENDED')), true);
    assert.equal(isConnectError(new Error('server closed the connection unexpectedly')), true);
  });

  it('does not retry application errors', () => {
    assert.equal(isConnectError(new Error('duplicate key value violates unique constraint')), false);
    assert.equal(isConnectError({ status: 409, code: 'CONFLICT' }), false);
  });
});

describe('storage-ready isolate reset policy', () => {
  it('treats 42P01 as a missing migration, not a dead socket', () => {
    const missing = { code: '42P01', message: 'relation "project_monitors" does not exist' };
    assert.equal(isMissingRelationError(missing), true);
    assert.equal(isConnectError(missing), false);
    assert.equal(shouldResetIsolateOnStorageError(missing), false);
  });

  it('resets only on a true connect/socket failure', () => {
    assert.equal(shouldResetIsolateOnStorageError(new Error('write CONNECT_TIMEOUT host:5432')), true);
    assert.equal(shouldResetIsolateOnStorageError({ code: 'CONNECTION_ENDED' }), true);
  });

  it('does not reset the isolate pool on an ordinary query error', () => {
    // This is the leftover that 1101'd siblings: monitorStorageReady used to
    // call resetDb() before rethrowing every non-42P01 error.
    assert.equal(shouldResetIsolateOnStorageError(new Error('password authentication failed')), false);
    assert.equal(shouldResetIsolateOnStorageError({ code: '53300', message: 'too many connections' }), false);
    assert.equal(shouldResetIsolateOnStorageError(new Error('duplicate key value violates unique constraint')), false);
  });
});

describe('dbCacheKind', () => {
  it('is request-scoped on Workers so sockets cannot cross I/O contexts', () => {
    assert.equal(dbCacheKind(true), 'request');
  });

  it('is process-scoped on Node so tests share one client', () => {
    assert.equal(dbCacheKind(false), 'process');
  });
});
