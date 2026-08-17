'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Status = {
  plan: 'free' | 'pro';
  status: string;
  projectCount: number;
  projectLimit: number | null;
};

export function BillingBadge() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch('/api/billing/status', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.plan) setStatus(d);
      })
      .catch(() => {});
  }, []);

  const openPortal = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.error || 'Could not open billing portal');
    } catch {
      alert('Could not open billing portal');
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return (
      <div className="px-4 py-3 border-t border-border-subtle">
        <p className="text-[11px] text-text-dim">Loading plan…</p>
      </div>
    );
  }

  const limitLabel =
    status.projectLimit === null
      ? `${status.projectCount} projects`
      : `${status.projectCount} / ${status.projectLimit} projects`;

  return (
    <div className="px-4 py-3 border-t border-border-subtle space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-text">
          {status.plan === 'pro' ? 'Pro' : 'Free'}
        </span>
        <span className="text-[11px] text-text-dim tabular-nums">{limitLabel}</span>
      </div>
      {status.plan === 'free' ? (
        <Link
          href="/pricing"
          className="block text-center text-xs font-medium text-purple-light hover:underline"
        >
          Upgrade to Pro
        </Link>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void openPortal()}
          className="w-full text-xs text-text-dim hover:text-text disabled:opacity-50"
        >
          {busy ? 'Opening…' : 'Manage billing'}
        </button>
      )}
    </div>
  );
}
