import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { errorDetail, projectErrorResponse } from './project-errors';
import { ProjectError } from './project-validation';

describe('projectErrorResponse', () => {
  it('keeps ProjectError status and message', async () => {
    const res = projectErrorResponse(new ProjectError(401, 'UNAUTHORIZED', 'Please sign in again.'));
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: 'Please sign in again.', code: 'UNAUTHORIZED' });
  });

  it('does not hide a socket throw behind the generic save/load string', async () => {
    const error = new Error('write CONNECT_TIMEOUT hyperdrive.local:5432');
    const res = projectErrorResponse(error);
    assert.equal(res.status, 503);
    const body = (await res.json()) as { code: string; error: string; detail: string };
    assert.equal(body.code, 'SERVICE_UNAVAILABLE');
    assert.equal(body.error, 'Could not reach the project database. Please try again.');
    assert.match(body.detail, /CONNECT_TIMEOUT/);
  });

  it('still uses the caller fallback for unknown throws', async () => {
    const res = projectErrorResponse(new TypeError('Unusable timestamp:'), 'Could not run that check. Please try again.');
    assert.equal(res.status, 503);
    const body = (await res.json()) as { error: string; detail: string };
    assert.equal(body.error, 'Could not run that check. Please try again.');
    assert.match(body.detail, /Unusable timestamp/);
  });
});

describe('errorDetail', () => {
  it('prefers name + message, and falls back to the stack when message is empty', () => {
    assert.equal(errorDetail(new TypeError('boom')), 'TypeError: boom');
    const empty = new Error();
    empty.stack = 'Error\n    at startRead (node-internal:internal_net:1527:25)';
    assert.match(errorDetail(empty), /startRead|Error/);
  });
});
