'use client';

import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { cn } from '../lib/utils';

/**
 * Weekly email opt-out, in the sidebar next to billing. Renders nothing until
 * the current setting is known, and nothing at all if the digest is unavailable
 * (for instance before its migration has been applied), so it never offers a
 * switch that would not do anything.
 */
export function DigestPreference() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch('/api/email/preferences', { credentials: 'include' })
      .then((res) => (res.ok ? (res.json() as Promise<unknown>) : null))
      .then((data) => {
        const value = (data as { weeklyDigest?: unknown } | null)?.weeklyDigest;
        if (active && typeof value === 'boolean') setEnabled(value);
      })
      .catch(() => {
        /* Unavailable is indistinguishable from off for this control. */
      });
    return () => {
      active = false;
    };
  }, []);

  if (enabled === null) return null;

  const toggle = async () => {
    const next = !enabled;
    setBusy(true);
    setFailed(false);
    // Optimistic, then reconciled: the switch should feel immediate.
    setEnabled(next);
    try {
      const res = await fetch('/api/email/preferences', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weeklyDigest: next }),
      });
      if (!res.ok) throw new Error('failed');
    } catch {
      setEnabled(!next);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-border-subtle px-4 py-3">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy}
        role="switch"
        aria-checked={enabled}
        className="flex w-full items-center gap-2 text-left disabled:opacity-60"
      >
        <Mail size={13} className="flex-shrink-0 text-text-dim" aria-hidden />
        <span className="flex-1 text-[11px] text-text-muted">Weekly review email</span>
        <span
          aria-hidden
          className={cn(
            'relative h-4 w-7 flex-shrink-0 rounded-full transition-colors',
            enabled ? 'bg-purple' : 'bg-border'
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform',
              enabled ? 'translate-x-3.5' : 'translate-x-0.5'
            )}
          />
        </span>
      </button>
      {failed && (
        <p role="alert" className="mt-1 text-[11px] text-danger">
          Could not save that. Try again.
        </p>
      )}
    </div>
  );
}
