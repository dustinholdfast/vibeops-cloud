import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clerkFrontendApi, clerkKeyKind } from './clerk-frontend';

describe('clerk frontend key', () => {
  it('decodes the Frontend API host from a publishable key', () => {
    const encoded = Buffer.from('foo.clerk.accounts.dev$').toString('base64');
    assert.equal(clerkFrontendApi(`pk_test_${encoded}`), 'foo.clerk.accounts.dev');
    assert.equal(clerkKeyKind(`pk_test_${encoded}`), 'test');
  });
});
