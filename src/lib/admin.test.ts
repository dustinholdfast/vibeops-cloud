import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { adminEmailsFromEnv, adminIdsFromEnv, isAdminUser, parseAdminList } from './admin';
import { isProStatus, resolvePlan } from './plans';

describe('admin allowlist', () => {
  it('splits comma or whitespace lists', () => {
    assert.deepEqual(parseAdminList('user_1, user_2\nuser_3'), ['user_1', 'user_2', 'user_3']);
    assert.deepEqual(parseAdminList(''), []);
    assert.deepEqual(parseAdminList(undefined), []);
  });

  it('matches clerk ids and emails from env', () => {
    const env = {
      ADMIN_USER_IDS: 'user_abc',
      ADMIN_EMAILS: 'Owner@Example.com',
    };
    assert.deepEqual(adminIdsFromEnv(env), ['user_abc']);
    assert.deepEqual(adminEmailsFromEnv(env), ['owner@example.com']);
    assert.equal(isAdminUser('user_abc', [], env), true);
    assert.equal(isAdminUser('user_other', ['owner@example.com'], env), true);
    assert.equal(isAdminUser('user_other', ['someone@else.com'], env), false);
  });

  it('fails closed when no allowlist is set', () => {
    assert.equal(isAdminUser('user_abc', ['a@b.com'], {}), false);
  });
});

describe('complimentary plan', () => {
  it('treats complimentary pro as pro', () => {
    assert.equal(isProStatus('complimentary'), true);
    assert.equal(resolvePlan('pro', 'complimentary'), 'pro');
    assert.equal(resolvePlan('pro', 'canceled'), 'free');
    assert.equal(resolvePlan('pro', 'active'), 'pro');
  });
});
