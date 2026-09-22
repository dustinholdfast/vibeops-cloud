import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProjectError } from './project-validation';
import {
  hashPasswordResetToken,
  isPasswordResetExpired,
  isPasswordResetTokenShape,
  maskEmail,
  parsePasswordResetMetadata,
  passwordResetMatches,
  passwordResetUrl,
  randomPasswordResetToken,
  renderPasswordResetEmail,
  timingSafeEqual,
  validateNewPassword,
} from './password-reset';

describe('maskEmail', () => {
  it('keeps the first local character and the domain', () => {
    assert.equal(maskEmail('jane@example.com'), 'j***@example.com');
    assert.equal(maskEmail('a@x.co'), 'a***@x.co');
  });

  it('does not leak a malformed address', () => {
    assert.equal(maskEmail('not-an-email'), '***');
  });
});

describe('validateNewPassword', () => {
  it('rejects short, long, and blank passwords', () => {
    assert.throws(() => validateNewPassword('short'), (error: unknown) => {
      return error instanceof ProjectError && error.status === 400;
    });
    assert.throws(() => validateNewPassword('x'.repeat(129)), ProjectError);
    assert.throws(() => validateNewPassword('        '), ProjectError);
  });

  it('accepts an 8-character password', () => {
    assert.equal(validateNewPassword('correct1'), 'correct1');
  });
});

describe('password reset tokens', () => {
  it('mints a 64-char hex token and hashes it stably', async () => {
    const token = randomPasswordResetToken();
    assert.equal(isPasswordResetTokenShape(token), true);
    assert.equal(await hashPasswordResetToken(token), await hashPasswordResetToken(token));
    assert.notEqual(await hashPasswordResetToken(token), await hashPasswordResetToken('ab'.repeat(32)));
  });

  it('compares hashes in constant time', () => {
    assert.equal(timingSafeEqual('abcd', 'abcd'), true);
    assert.equal(timingSafeEqual('abcd', 'abce'), false);
    assert.equal(timingSafeEqual('abc', 'abcd'), false);
  });

  it('builds a reset URL with user and token', () => {
    assert.equal(
      passwordResetUrl('https://noxencloud.com/', 'user_abc', 'aa'.repeat(32)),
      `https://noxencloud.com/reset-password?user=user_abc&token=${'aa'.repeat(32)}`
    );
  });

  it('rejects expired or malformed tokens', async () => {
    const token = randomPasswordResetToken();
    const meta = {
      tokenHash: await hashPasswordResetToken(token),
      expiresAt: Date.now() + 60_000,
      requestedByUserId: 'user_admin',
      requestedAt: Date.now(),
    };
    assert.equal(await passwordResetMatches(meta, token), true);
    assert.equal(await passwordResetMatches(meta, 'ff'.repeat(32)), false);
    assert.equal(await passwordResetMatches(meta, 'not-a-token'), false);
    assert.equal(isPasswordResetExpired({ ...meta, expiresAt: Date.now() - 1 }), true);
    assert.equal(await passwordResetMatches({ ...meta, expiresAt: Date.now() - 1 }, token), false);
  });

  it('ignores metadata that is missing fields', () => {
    assert.equal(parsePasswordResetMetadata(null), null);
    assert.equal(parsePasswordResetMetadata({ tokenHash: 'abc' }), null);
    assert.deepEqual(
      parsePasswordResetMetadata({
        tokenHash: 'abc',
        expiresAt: 1,
        requestedByUserId: 'user_admin',
        requestedAt: 2,
      }),
      {
        tokenHash: 'abc',
        expiresAt: 1,
        requestedByUserId: 'user_admin',
        requestedAt: 2,
      }
    );
  });
});

describe('renderPasswordResetEmail', () => {
  it('includes the reset URL and expiry in both bodies', () => {
    const email = renderPasswordResetEmail({
      resetUrl: 'https://noxencloud.com/reset-password?user=user_1&token=abc',
      firstName: 'Ada',
      hoursValid: 1,
    });
    assert.equal(email.subject, 'Reset your Noxen password');
    assert.match(email.text, /Hi Ada,/);
    assert.match(email.text, /expires in 1 hour/);
    assert.match(email.text, /noxencloud.com\/reset-password/);
    assert.match(email.html, /Choose a new password/);
    assert.match(email.html, /noxencloud.com\/reset-password/);
  });

  it('escapes a name that contains markup', () => {
    const email = renderPasswordResetEmail({
      resetUrl: 'https://noxencloud.com/reset-password?user=user_1&token=abc',
      firstName: '<script>alert(1)</script>',
      hoursValid: 1,
    });
    assert.doesNotMatch(email.html, /<script>/);
    assert.match(email.html, new RegExp('&' + 'lt;script' + '&' + 'gt;'));
  });
});
