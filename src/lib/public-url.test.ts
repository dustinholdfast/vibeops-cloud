import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { passwordResetUrl } from './password-reset';
import { CANONICAL_PUBLIC_ORIGIN, publicAppOrigin } from './public-url';

const WORKERS = 'https://vibeops-cloud.dustin-eef.workers.dev/api/admin/accounts/password-reset';
const KEYS = ['APP_URL', 'NEXT_PUBLIC_APP_URL', 'VERCEL_URL'] as const;

describe('publicAppOrigin', () => {
  afterEach(() => {
    for (const key of KEYS) delete process.env[key];
  });

  it('prefers APP_URL over a workers.dev request and a stale app URL', () => {
    process.env.APP_URL = 'https://noxencloud.com/';
    process.env.NEXT_PUBLIC_APP_URL = 'https://vibeops-cloud.dustin-eef.workers.dev';
    assert.equal(publicAppOrigin(WORKERS), CANONICAL_PUBLIC_ORIGIN);
  });

  it('honors an explicit workers.dev APP_URL so staging can opt out', () => {
    process.env.APP_URL = 'https://vibeops-cloud.dustin-eef.workers.dev';
    assert.equal(
      publicAppOrigin('https://noxencloud.com/admin'),
      'https://vibeops-cloud.dustin-eef.workers.dev'
    );
  });

  it('uses a custom-domain NEXT_PUBLIC_APP_URL read at runtime, not the request host', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://noxencloud.com\r';
    assert.equal(publicAppOrigin(WORKERS), CANONICAL_PUBLIC_ORIGIN);
  });

  it('ignores a workers.dev NEXT_PUBLIC_APP_URL when the request is the custom domain', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://vibeops-cloud.dustin-eef.workers.dev';
    assert.equal(publicAppOrigin('https://noxencloud.com/admin'), CANONICAL_PUBLIC_ORIGIN);
  });

  it('uses the canonical origin when both the secret and the request are workers.dev', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://vibeops-cloud.dustin-eef.workers.dev';
    const origin = publicAppOrigin(WORKERS);
    assert.equal(origin, CANONICAL_PUBLIC_ORIGIN);
    assert.equal(
      passwordResetUrl(origin, 'user_abc', 'aa'.repeat(32)),
      `https://noxencloud.com/reset-password?user=user_abc&token=${'aa'.repeat(32)}`
    );
  });

  it('uses the canonical origin when nothing is configured and the request is workers.dev', () => {
    assert.equal(publicAppOrigin(WORKERS), CANONICAL_PUBLIC_ORIGIN);
  });

  it('uses the request origin when it is already the public domain', () => {
    assert.equal(publicAppOrigin('https://noxencloud.com/admin'), CANONICAL_PUBLIC_ORIGIN);
  });

  it('folds www into the apex', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://www.noxencloud.com';
    assert.equal(publicAppOrigin(WORKERS), CANONICAL_PUBLIC_ORIGIN);
  });

  it('ignores the CI placeholder example.invalid', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://example.invalid';
    assert.equal(publicAppOrigin(WORKERS), CANONICAL_PUBLIC_ORIGIN);
  });

  it('keeps localhost for local requests', () => {
    assert.equal(
      publicAppOrigin('http://localhost:3001/api/admin/accounts/password-reset'),
      'http://localhost:3001'
    );
  });

  it('keeps a localhost NEXT_PUBLIC_APP_URL even if a stray request host is workers.dev', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3001';
    assert.equal(publicAppOrigin(WORKERS), 'http://localhost:3001');
  });

  it('falls back to VERCEL_URL when no public app URL is set', () => {
    process.env.VERCEL_URL = 'preview.vercel.app';
    assert.equal(publicAppOrigin(), 'https://preview.vercel.app');
  });

  it('defaults to local when nothing is configured and there is no request', () => {
    assert.equal(publicAppOrigin(), 'http://localhost:3001');
  });
});
