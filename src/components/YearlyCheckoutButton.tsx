'use client';

import { useState } from 'react';
import Link from 'next/link';
import { startYearlyCheckout } from '@/src/lib/checkout-client';

export function YearlyCheckoutButton({
  className,
  children,
  role,
  busyLabel = 'Opening checkout…',
}: {
  className?: string;
  children: React.ReactNode;
  role?: string;
  busyLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        role={role}
        disabled={busy}
        className={className}
        onClick={() => {
          setBusy(true);
          setError(null);
          void startYearlyCheckout().catch((cause: unknown) => {
            setError(cause instanceof Error ? cause.message : 'Checkout failed');
            setBusy(false);
          });
        }}
      >
        {busy ? busyLabel : children}
      </button>
      {error && (
        <span className="block px-2 text-[11px] text-danger">
          {error}{' '}
          <Link href="/pricing" className="underline">
            View plans
          </Link>
        </span>
      )}
    </>
  );
}
