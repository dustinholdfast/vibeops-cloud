import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isMissingStripeCustomer } from './stripe';

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
