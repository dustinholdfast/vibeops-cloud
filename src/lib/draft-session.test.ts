import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldResetDraftSession } from './draft-session';

describe('shouldResetDraftSession', () => {
  it('does not reset before Clerk has been observed, including the handshake gap', () => {
    assert.equal(shouldResetDraftSession(undefined, null), false);
    assert.equal(shouldResetDraftSession(undefined, undefined), false);
    assert.equal(shouldResetDraftSession(undefined, 'user_alice'), false);
  });

  it('does not reset when a signed-in user stays signed in, or when Clerk is still empty', () => {
    assert.equal(shouldResetDraftSession('user_alice', 'user_alice'), false);
    assert.equal(shouldResetDraftSession(null, null), false);
    assert.equal(shouldResetDraftSession(null, 'user_alice'), false);
  });

  it('resets on a real sign-out or account switch', () => {
    assert.equal(shouldResetDraftSession('user_alice', null), true);
    assert.equal(shouldResetDraftSession('user_alice', 'user_bob'), true);
  });
});
