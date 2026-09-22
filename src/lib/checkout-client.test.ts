import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startYearlyCheckout } from './checkout-client';

describe('refusal checkout', () => {
  it('opens Stripe Checkout for the yearly price', async () => {
    const original = globalThis.fetch;
    let body = '';
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      body = String(init?.body ?? '');
      return new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/cs_test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;
    const location = { href: '' };
    try {
      await startYearlyCheckout(location);
    } finally {
      globalThis.fetch = original;
    }
    assert.deepEqual(JSON.parse(body), { interval: 'year' });
    assert.equal(location.href, 'https://checkout.stripe.com/c/pay/cs_test');
  });
});
