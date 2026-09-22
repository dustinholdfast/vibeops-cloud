import Stripe from 'stripe';
import { env } from './env';
import { publicAppOrigin } from './public-url';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  // stripe@18 pins API version 2025-08-27.basil (required for Managed Payments)
  _stripe = new Stripe(key, {
    apiVersion: '2025-08-27.basil',
    typescript: true,
    /**
     * The SDK defaults to Node's http module, which workerd does not provide.
     * The fetch client works under both runtimes, so it is set unconditionally
     * rather than branching on the environment.
     */
    httpClient: Stripe.createFetchHttpClient(),
  });
  return _stripe;
}

/**
 * Verifies webhook signatures using Web Crypto.
 *
 * `constructEvent` is synchronous and needs Node's `crypto`; on Workers only
 * the async path backed by SubtleCrypto exists. Cached because creating a
 * provider per request is wasted work.
 */
let _cryptoProvider: ReturnType<typeof Stripe.createSubtleCryptoProvider> | null = null;

export function getWebhookCryptoProvider() {
  _cryptoProvider ??= Stripe.createSubtleCryptoProvider();
  return _cryptoProvider;
}

export function getAppUrl(): string {
  return publicAppOrigin();
}

/** Stripe still has this id in our database, but the current account does not. */
export function isMissingStripeCustomer(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as { code?: unknown; message?: unknown };
  const message = typeof record.message === 'string' ? record.message : '';
  return record.code === 'resource_missing' && /no such customer/i.test(message);
}

/** A Stripe price id, or null when the stored value is empty or not a price_. */
export function stripePriceId(value: string | undefined): string | null {
  if (!value) return null;
  const id = value.trim().replace(/^['"]|['"]$/g, '');
  return /^price_[A-Za-z0-9]+$/.test(id) ? id : null;
}

export function stripeKeyMode(key: string | undefined): 'test' | 'live' | 'missing' | 'unknown' {
  if (!key) return 'missing';
  if (key.startsWith('sk_test_') || key.startsWith('rk_test_')) return 'test';
  if (key.startsWith('sk_live_') || key.startsWith('rk_live_')) return 'live';
  return 'unknown';
}

export function getProPriceId(interval: 'month' | 'year'): string {
  const name = interval === 'year' ? 'STRIPE_PRICE_PRO_YEARLY' : 'STRIPE_PRICE_PRO_MONTHLY';
  const id = stripePriceId(env(name));
  if (!id) {
    throw new Error(
      `Stripe ${interval} price is missing or is not a price_ id. Copy it from the Stripe Dashboard in ${stripeKeyMode(env('STRIPE_SECRET_KEY'))} mode.`
    );
  }
  return id;
}

export function isMissingStripePrice(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as { code?: unknown; message?: unknown };
  const message = typeof record.message === 'string' ? record.message : '';
  return record.code === 'resource_missing' && /no such price/i.test(message);
}
