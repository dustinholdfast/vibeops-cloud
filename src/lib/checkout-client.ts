import { parseJson } from './api';

/** Refusal upgrades bill the yearly price. Monthly stays on the pricing page. */
export const REFUSAL_CHECKOUT_INTERVAL = 'year' as const;

export async function startYearlyCheckout(
  location: { href: string } = window.location
): Promise<void> {
  const res = await fetch('/api/billing/checkout', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ interval: REFUSAL_CHECKOUT_INTERVAL }),
  });
  const data = await parseJson<{ url?: string }>(res);
  if (!data.url) throw new Error('No checkout URL returned');
  location.href = data.url;
}
