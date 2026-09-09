'use client';

import { useEffect, useState } from 'react';
import { Activity, Mail } from 'lucide-react';
import { cn } from '../lib/utils';

/**
 * Email opt-outs, in the sidebar next to billing.
 *
 * Each switch renders only once its current setting is known, and not at all
 * when that setting is unavailable (for instance before its migration has been
 * applied), so it never offers a control that would not do anything.
 *
 * The two settings are independent on purpose: someone who does not want a
 * weekly summary usually still wants to hear that their site is down.
 */

type Prefs = { weeklyDigest?: unknown; uptimeAlerts?: unknown };

function Toggle({
  label,
  icon,
  enabled,
  busy,
  onToggle,
}: {
  label: string;
  icon: React.ReactNode;
  enabled: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy}
      role="switch"
      aria-checked={enabled}
      className="flex w-full items-center gap-2 text-left disabled:opacity-60"
    >
      {icon}
      <span className="flex-1 text-[11px] text-text-muted">{label}</span>
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
  );
}

export function EmailPreferences() {
  const [digest, setDigest] = useState<boolean | null>(null);
  const [alerts, setAlerts] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch('/api/email/preferences', { credentials: 'include' })
      .then((res) => (res.ok ? (res.json() as Promise<unknown>) : null))
      .then((data) => {
        if (!active) return;
        const prefs = (data as Prefs | null) ?? {};
        if (typeof prefs.weeklyDigest === 'boolean') setDigest(prefs.weeklyDigest);
        // Null means the uptime migration is not applied on this deployment.
        if (typeof prefs.uptimeAlerts === 'boolean') setAlerts(prefs.uptimeAlerts);
      })
      .catch(() => {
        /* Unavailable is indistinguishable from off for these controls. */
      });
    return () => {
      active = false;
    };
  }, []);

  if (digest === null && alerts === null) return null;

  /** Optimistic, then reconciled: the switch should feel immediate. */
  async function toggle(
    key: 'weeklyDigest' | 'uptimeAlerts',
    current: boolean,
    apply: (value: boolean) => void
  ) {
    const next = !current;
    setBusy(true);
    setFailed(false);
    apply(next);

    try {
      const res = await fetch('/api/email/preferences', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: next }),
      });
      if (!res.ok) throw new Error('failed');
    } catch {
      apply(current);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 border-t border-border-subtle px-4 py-3">
      {digest !== null && (
        <Toggle
          label="Weekly review email"
          icon={<Mail size={13} className="flex-shrink-0 text-text-dim" aria-hidden />}
          enabled={digest}
          busy={busy}
          onToggle={() => void toggle('weeklyDigest', digest, setDigest)}
        />
      )}
      {alerts !== null && (
        <Toggle
          label="Uptime alerts"
          icon={<Activity size={13} className="flex-shrink-0 text-text-dim" aria-hidden />}
          enabled={alerts}
          busy={busy}
          onToggle={() => void toggle('uptimeAlerts', alerts, setAlerts)}
        />
      )}
      {failed && (
        <p role="alert" className="mt-1 text-[11px] text-danger">
          Could not save that. Try again.
        </p>
      )}
    </div>
  );
}
