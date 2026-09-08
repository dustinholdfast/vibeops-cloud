'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { parseJson } from '@/src/lib/api';

type Account = {
  userId: string;
  email: string | null;
  name: string | null;
  plan: 'free' | 'pro';
  status: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  ownedWorkspaces: { id: string; name: string; personal: boolean; projects: number }[];
  memberships: number;
  projectCount: number;
  projectLimit: number | null;
};

export function AdminClient() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    const res = await fetch('/api/admin/accounts', { credentials: 'include' });
    if (res.status === 403) {
      setError('This account is not on the admin allowlist.');
      setAccounts([]);
      return;
    }
    if (!res.ok) {
      const body = await parseJson<{ error?: string }>(res).catch(() => ({}));
      setError(body.error || 'Could not load accounts.');
      setAccounts([]);
      return;
    }
    const data = await parseJson<{ accounts: Account[] }>(res);
    setAccounts(data.accounts);
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    if (!accounts) return [];
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((account) =>
      [account.email, account.name, account.userId, account.plan, account.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [accounts, query]);

  const setPlan = async (userId: string, plan: 'free' | 'pro', cancelStripe = false) => {
    setBusyId(userId);
    try {
      const res = await fetch('/api/admin/accounts', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, plan, cancelStripe }),
      });
      const body = await parseJson<{ error?: string }>(res);
      if (!res.ok) {
        alert(body.error || 'Could not update plan');
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-full bg-background text-text">
      <header className="border-b border-border-subtle">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" width={28} height={28} className="w-7 h-7 rounded-full" />
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wider text-text-dim">Vibe / Ops</p>
              <h1 className="text-lg font-semibold tracking-tight">Admin</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-text-muted hover:text-text">
              Dashboard
            </Link>
            <UserButton afterSignOutUrl="/" appearance={{ elements: { avatarBox: 'w-8 h-8' } }} />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
          <div>
            <p className="text-sm text-text-muted">
              Plans are stored on the account that owns the workspace. Complimentary Pro does not
              create a Stripe charge.
            </p>
          </div>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search email, name, or user id"
            className="w-72 max-w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-dim focus:outline-none focus:border-purple/50"
          />
        </div>

        {error && (
          <p role="alert" className="mb-4 text-sm text-danger">
            {error}
          </p>
        )}

        {accounts === null ? (
          <p className="text-sm text-text-dim">Loading accounts…</p>
        ) : (
          <div className="space-y-2">
            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-text-dim">
                No accounts match.
              </div>
            ) : (
              filtered.map((account) => (
                <article
                  key={account.userId}
                  className="rounded-2xl border border-border bg-surface px-4 py-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-text truncate">
                        {account.name || account.email || account.userId}
                      </p>
                      <p className="text-sm text-text-muted truncate">
                        {account.email ?? 'No email on file'}
                      </p>
                      <p className="mt-1 text-[11px] text-text-dim font-mono truncate">{account.userId}</p>
                      <p className="mt-2 text-xs text-text-dim">
                        {account.projectCount} project{account.projectCount === 1 ? '' : 's'} across{' '}
                        {account.ownedWorkspaces.length} owned workspace
                        {account.ownedWorkspaces.length === 1 ? '' : 's'}
                        {account.projectLimit !== null ? ` · free cap ${account.projectLimit}` : ' · unlimited'}
                      </p>
                      {account.ownedWorkspaces.length > 0 && (
                        <p className="mt-1 text-xs text-text-muted truncate">
                          {account.ownedWorkspaces.map((workspace) => workspace.name).join(', ')}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span
                        className={
                          account.plan === 'pro'
                            ? 'rounded-full bg-purple/15 px-2.5 py-0.5 text-[11px] font-medium text-purple-light'
                            : 'rounded-full bg-surface-elevated px-2.5 py-0.5 text-[11px] font-medium text-text-muted'
                        }
                      >
                        {account.plan === 'pro' ? 'Pro' : 'Free'}
                        {account.status === 'complimentary' ? ' · complimentary' : ` · ${account.status}`}
                      </span>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <button
                          type="button"
                          disabled={busyId === account.userId || account.plan === 'pro'}
                          onClick={() => void setPlan(account.userId, 'pro')}
                          className="rounded-lg bg-purple px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                        >
                          Grant Pro
                        </button>
                        <button
                          type="button"
                          disabled={busyId === account.userId || account.plan === 'free'}
                          onClick={() => void setPlan(account.userId, 'free')}
                          className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-text-muted hover:text-text disabled:opacity-40"
                        >
                          Set Free
                        </button>
                        {account.stripeSubscriptionId && (
                          <button
                            type="button"
                            disabled={busyId === account.userId}
                            onClick={() => {
                              if (
                                !confirm(
                                  `Cancel the Stripe subscription for ${account.email ?? account.userId} and set Free?`
                                )
                              )
                                return;
                              void setPlan(account.userId, 'free', true);
                            }}
                            className="rounded-lg border border-danger/40 px-2.5 py-1.5 text-xs text-danger disabled:opacity-40"
                          >
                            Cancel Stripe
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}
