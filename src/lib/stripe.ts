import Stripe from 'stripe';

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
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`.replace(/\/$/, '');
  }
  return 'http://localhost:3001';
}

export function getProPriceId(interval: 'month' | 'year'): string {
  const id =
    interval === 'year'
      ? process.env.STRIPE_PRICE_PRO_YEARLY
      : process.env.STRIPE_PRICE_PRO_MONTHLY;
  if (!id) {
    throw new Error(
      `Missing Stripe price env for ${interval} (STRIPE_PRICE_PRO_MONTHLY / YEARLY)`
    );
  }
  return id;
}
