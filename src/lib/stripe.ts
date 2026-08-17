import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  // Omit apiVersion so stripe-node uses the version pinned by the installed SDK
  // (avoids TS mismatch across minor stripe package updates).
  _stripe = new Stripe(key, {
    typescript: true,
  });
  return _stripe;
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
