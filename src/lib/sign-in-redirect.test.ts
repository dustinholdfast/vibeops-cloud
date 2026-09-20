import test from 'node:test';
import assert from 'node:assert/strict';
import { safeAuthRedirect, signInUrl } from './sign-in-redirect';

test('dashboard sign-in has no extra redirect_url', () => {
  const url = new URL(signInUrl('https://vibeops-cloud.dustin-eef.workers.dev', '/dashboard'));
  assert.equal(url.pathname, '/sign-in');
  assert.equal(url.searchParams.get('redirect_url'), null);
});

test('uptime sign-in keeps a relative return path', () => {
  const url = new URL(signInUrl('https://vibeops-cloud.dustin-eef.workers.dev', '/uptime'));
  assert.equal(url.searchParams.get('redirect_url'), '/uptime');
});

test('safeAuthRedirect rejects open redirects', () => {
  assert.equal(safeAuthRedirect('https://evil.example'), '/dashboard');
  assert.equal(safeAuthRedirect('//evil.example'), '/dashboard');
  assert.equal(safeAuthRedirect('/sign-in'), '/dashboard');
  assert.equal(safeAuthRedirect('/uptime?tab=down'), '/uptime?tab=down');
});
