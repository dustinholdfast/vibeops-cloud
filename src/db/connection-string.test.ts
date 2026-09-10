import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseConnectionString } from './index';

/**
 * Both rules exist because of strings copied straight out of Neon's console,
 * which is how anyone actually configures this.
 */

const NEON =
  'postgresql://user:pw@ep-example-123456-pooler.c-4.us-east-2.aws.neon.tech/neondb';

describe('normaliseConnectionString', () => {
  it('drops channel_binding, which postgres.js forwards and Postgres rejects', () => {
    const out = normaliseConnectionString(`${NEON}?sslmode=require&channel_binding=require`);
    assert.ok(!out.includes('channel_binding'));
  });

  it('keeps sslmode=require off Workers, where it works', () => {
    const out = normaliseConnectionString(`${NEON}?sslmode=require`, false);
    assert.match(out, /sslmode=require/);
  });

  it('raises sslmode=require to verify-full on Workers, where it cannot connect', () => {
    const out = normaliseConnectionString(`${NEON}?sslmode=require`, true);
    assert.match(out, /sslmode=verify-full/);
    assert.ok(!/sslmode=require/.test(out));
  });

  it('leaves an already strict sslmode alone', () => {
    const out = normaliseConnectionString(`${NEON}?sslmode=verify-full`, true);
    assert.match(out, /sslmode=verify-full/);
  });

  it('does not invent an sslmode where there was none', () => {
    const out = normaliseConnectionString(NEON, true);
    assert.ok(!out.includes('sslmode'));
  });

  it('handles both problems in one string', () => {
    const out = normaliseConnectionString(
      `${NEON}?sslmode=require&channel_binding=require`,
      true
    );
    assert.match(out, /sslmode=verify-full/);
    assert.ok(!out.includes('channel_binding'));
    assert.match(out, /ep-example-123456-pooler/);
    assert.match(out, /\/neondb/);
  });

  it('preserves the password and other parameters', () => {
    const out = normaliseConnectionString(
      `${NEON}?sslmode=require&application_name=vibeops&channel_binding=require`,
      true
    );
    assert.match(out, /user:pw@/);
    assert.match(out, /application_name=vibeops/);
  });

  it('returns anything unparseable untouched, for the driver to report', () => {
    assert.equal(normaliseConnectionString('not a url'), 'not a url');
  });

  it('changes nothing when there is nothing to change', () => {
    const plain = 'postgres://u:p@127.0.0.1:5432/db';
    assert.equal(normaliseConnectionString(plain, true), plain);
  });
});
