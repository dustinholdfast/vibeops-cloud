import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { env } from './env';

const KEY = 'VIBEOPS_ENV_TRIM_TEST';

describe('env', () => {
  afterEach(() => {
    delete process.env[KEY];
  });

  it('returns undefined when the name is unset or empty', () => {
    assert.equal(env(KEY), undefined);
    process.env[KEY] = '   ';
    assert.equal(env(KEY), undefined);
  });

  it('strips a trailing CR left by Windows .env / secret put', () => {
    process.env[KEY] = 'pk_test_abc\r';
    assert.equal(env(KEY), 'pk_test_abc');
  });

  it('strips a UTF-8 BOM', () => {
    process.env[KEY] = '\uFEFFsk_test_abc';
    assert.equal(env(KEY), 'sk_test_abc');
  });
});
