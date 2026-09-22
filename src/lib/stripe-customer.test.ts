import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isMissingStripeCustomer, isMissingStripePrice, stripeKeyMode, stripePriceId } from './stripe';

describe('isMissingStripeCustomer', () => {
  it('matches the error Stripe returns for a customer from another account', () => {
    const error = Object.assign(new Error("No such customer: 'cus_missing'"), {
      code: 'resource_missing',
    });
    assert.equal(isMissingStripeCustomer(error), true);
  });

  it('does not treat a missing price or a generic failure as a stale customer', () => {
    assert.equal(
      isMissingStripeCustomer(
        Object.assign(new Error('No such price: price_missing'), { code: 'resource_missing' })
      ),
      false
    );
    assert.equal(isMissingStripeCustomer(new Error('No such customer')), false);
    assert.equal(isMissingStripeCustomer(null), false);
  });
});

describe('stripe price ids', () => {
  it('accepts a price id and rejects blanks, quotes, and other ids', () => {
    assert.equal(stripePriceId(' price_abc123 '), 'price_abc123');
    assert.equal(stripePriceId('"price_abc123"'), 'price_abc123');
    assert.equal(stripePriceId('prod_abc'), null);
    assert.equal(stripePriceId(''), null);
  });

  it('reads test and live key prefixes only', () => {
    assert.equal(stripeKeyMode('sk_test_123'), 'test');
    assert.equal(stripeKeyMode('sk_live_123'), 'live');
    assert.equal(stripeKeyMode(undefined), 'missing');
  });

  it('recognises a missing price separately from a missing customer', () => {
    const error = Object.assign(new Error("No such price: 'price_missing'"), {
      code: 'resource_missing',
    });
    assert.equal(isMissingStripePrice(error), true);
    assert.equal(isMissingStripeCustomer(error), false);
  });
});
