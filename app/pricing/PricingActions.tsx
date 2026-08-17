'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { PlanId } from '@/src/lib/plans';

export function PricingActions({
  planId,
  signedIn,
}: {
  planId: PlanId;
  signedIn: boolean;
}) {
  const [loading, setLoading] = useState<'month' | 'year' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (planId === 'free') {
    return (
      <Link
        href={signedIn ? '/dashboard' : '/sign-up'}
        className="inline-flex w-full items-center justify-center px-4 py-2.5 rounded-lg border border-border bg-surface-elevated text-sm font-medium text-text hover:bg-border transition-colors"
      >
        {signedIn ? 'Open dashboard' : 'Start free'}
      </Link>
    );
  }

  if (!signedIn) {
    return (
      <Link
        href="/sign-up"
        className="inline-flex w-full items-center justify-center px-4 py-2.5 rounded-lg bg-purple hover:bg-purple-light text-white text-sm font-medium transition-colors"
      >
        Sign up for Pro
      </Link>
    );
  }

  const checkout = async (interval: 'month' | 'year') => {
    setLoading(interval);
    setError(null);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Checkout failed');
      if (data.url) window.location.href = data.url;
      else throw new Error('No checkout URL returned');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout failed');
      setLoading(null);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={loading !== null}
        onClick={() => void checkout('month')}
        className="w-full px-4 py-2.5 rounded-lg bg-purple hover:bg-purple-light disabled:opacity-60 text-white text-sm font-medium transition-colors"
      >
        {loading === 'month' ? 'Redirecting…' : 'Upgrade monthly — $12'}
      </button>
      <button
        type="button"
        disabled={loading !== null}
        onClick={() => void checkout('year')}
        className="w-full px-4 py-2.5 rounded-lg border border-purple/40 text-purple-light hover:bg-purple/10 disabled:opacity-60 text-sm font-medium transition-colors"
      >
        {loading === 'year' ? 'Redirecting…' : 'Upgrade yearly — $120'}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
