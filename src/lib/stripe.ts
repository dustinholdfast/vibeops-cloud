import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  _stripe = new Stripe(key, {
    apiVersion: '2025-01-27.acacia',
    typescript: true,
  });
  return _stripe;
}

export function getAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL?.replace(/^/, 'https://') ||
    'http://localhost:3001'
  ).replace(/\/$/, '');
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
