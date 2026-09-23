import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PUBLIC_ROUTE_MATCHERS, isPublicPathname } from './public-routes';

describe('public routes', () => {
  it('lets crawlers and buyers hit marketing URLs without signing in', () => {
    for (const path of ['/', '/pricing', '/privacy', '/terms', '/robots.txt', '/sitemap.xml']) {
      assert.equal(isPublicPathname(path), true, path);
    }
  });

  it('still protects the product', () => {
    assert.equal(isPublicPathname('/dashboard'), false);
    assert.equal(isPublicPathname('/uptime'), false);
    assert.equal(isPublicPathname('/admin'), false);
    assert.equal(isPublicPathname('/api/projects'), false);
  });

  it('keeps matcher globs in the same set as the pathname helper', () => {
    assert.ok(PUBLIC_ROUTE_MATCHERS.includes('/privacy'));
    assert.ok(PUBLIC_ROUTE_MATCHERS.includes('/terms'));
    assert.ok(PUBLIC_ROUTE_MATCHERS.includes('/robots.txt'));
    assert.ok(PUBLIC_ROUTE_MATCHERS.includes('/sitemap.xml'));
  });
});
