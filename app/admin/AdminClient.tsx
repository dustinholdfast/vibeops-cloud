'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import {
  Check,
  Copy,
  CreditCard,
  Gift,
  LayoutDashboard,
  Search,
  Shield,
  Sun,
  Moon,
} from 'lucide-react';
import { useTheme } from '@/src/lib/useTheme';

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

type PlanFilter = 'all' | 'free' | 'pro' | 'complimentary' | 'stripe';

async function readBody(res: Response) {
  return (await res.json().catch(() => ({}))) as { error?: string; accounts?: Account[] };
}

function initials(account: Account) {
  const source = account.name || account.email || account.userId;
  const parts = source.split(/[\s@._-]+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return 'V';
  return parts.map((part) => part[0]!.toUpperCase()).join('');
}

function formatPeriod(iso: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function AdminClient() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PlanFilter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2800);
  };

  const load = async () => {
    setError(null);
    const res = await fetch('/api/admin/accounts', { credentials: 'include' });
    const body = await readBody(res);
    if (res.status === 403) {
      setForbidden(true);
      setAccounts([]);
      return;
    }
    if (!res.ok) {
      setError(body.error || 'Could not load accounts.');
      setAccounts([]);
      return;
    }
    setForbidden(false);
    setAccounts(body.accounts ?? []);
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const stats = useMemo(() => {
    const list = accounts ?? [];
    return {
      total: list.length,
      pro: list.filter((a) => a.plan === 'pro').length,
      complimentary: list.filter((a) => a.status === 'complimentary').length,
      stripe: list.filter((a) => Boolean(a.stripeSubscriptionId)).length,
    };
  }, [accounts]);

  const filtered = useMemo(() => {
    if (!accounts) return [];
    const q = query.trim().toLowerCase();
    return accounts.filter((account) => {
      if (filter === 'free' && account.plan !== 'free') return false;
      if (filter === 'pro' && account.plan !== 'pro') return false;
      if (filter === 'complimentary' && account.status !== 'complimentary') return false;
      if (filter === 'stripe' && !account.stripeSubscriptionId) return false;
      if (!q) return true;
      return [account.email, account.name, account.userId, account.plan, account.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [accounts, query, filter]);

  const setPlan = async (userId: string, plan: 'free' | 'pro', cancelStripe = false) => {
    setBusyId(userId);
    try {
      const res = await fetch('/api/admin/accounts', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, plan, cancelStripe }),
      });
      const body = await readBody(res);
      if (!res.ok) {
        showToast(body.error || 'Could not update plan');
        return;
      }
      showToast(plan === 'pro' ? 'Pro granted' : cancelStripe ? 'Stripe canceled, set Free' : 'Set to Free');
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const deleteUser = async (account: Account) => {
    const label = account.email ?? account.userId;
    const owned = account.ownedWorkspaces.length;
    if (
      !confirm(
        `Delete ${label}? This removes their Clerk login, ${owned} owned workspace${owned === 1 ? '' : 's'}, projects, memberships, and billing row. It cannot be undone.`
      )
    ) {
      return;
    }
    setBusyId(account.userId);
    try {
      const res = await fetch('/api/admin/accounts', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: account.userId }),
      });
      const body = await readBody(res);
      if (!res.ok) {
        showToast(body.error || 'Could not delete user');
        return;
      }
      setSelectedId(null);
      showToast(`Deleted ${label}`);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      showToast('Could not copy');
    }
  };

  return (
    <div className="min-h-full bg-background text-text">
      <header className="border-b border-border-subtle">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" width={28} height={28} className="w-7 h-7 rounded-full" />
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wider text-text-dim">Vibe / Ops</p>
              <h1 className="text-lg font-semibold tracking-tight">Admin</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-muted hover:text-text"
            >
              <LayoutDashboard size={14} aria-hidden />
              Dashboard
            </Link>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-surface border border-border text-text-muted hover:text-text"
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <UserButton afterSignOutUrl="/" appearance={{ elements: { avatarBox: 'w-8 h-8' } }} />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6 pb-16">
        {forbidden ? (
          <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center">
            <Shield className="mx-auto text-text-dim" size={22} aria-hidden />
            <h2 className="mt-3 text-lg font-semibold">Not on the allowlist</h2>
            <p className="mt-1 text-sm text-text-muted max-w-md mx-auto">
              Add your Clerk user id to <code className="text-text">ADMIN_USER_IDS</code> or your email
              to <code className="text-text">ADMIN_EMAILS</code>, then refresh.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              <Metric label="Accounts" value={accounts === null ? '\u2014' : String(stats.total).padStart(2, '0')} hint="Known owners and members" />
              <Metric label="Pro" value={accounts === null ? '\u2014' : String(stats.pro).padStart(2, '0')} hint="Paid or complimentary" tone="text-purple-light" />
              <Metric label="Complimentary" value={accounts === null ? '\u2014' : String(stats.complimentary).padStart(2, '0')} hint="Granted in this console" />
              <Metric label="Stripe live" value={accounts === null ? '\u2014' : String(stats.stripe).padStart(2, '0')} hint="Has a subscription id" />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-1 flex-wrap" role="group" aria-label="Filter accounts">
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'pro', label: 'Pro' },
                    { id: 'free', label: 'Free' },
                    { id: 'complimentary', label: 'Complimentary' },
                    { id: 'stripe', label: 'Stripe' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setFilter(item.id)}
                    aria-pressed={filter === item.id}
                    className={
                      filter === item.id
                        ? 'rounded-full bg-purple/20 px-2.5 py-1 text-[11px] font-medium text-purple-light border border-purple/40'
                        : 'rounded-full bg-surface-elevated px-2.5 py-1 text-[11px] font-medium text-text-dim border border-transparent hover:text-text'
                    }
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search accounts"
                  className="w-64 max-w-full pl-9 pr-12 py-2 rounded-lg bg-surface border border-border text-sm text-text placeholder:text-text-dim focus:outline-none focus:border-purple/50"
                />
                <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 hidden sm:inline text-[10px] text-text-dim border border-border rounded px-1.5 py-0.5">
                  ⌘K
                </kbd>
              </div>
            </div>

            {error && (
              <p role="alert" className="mb-4 text-sm text-danger">
                {error}
              </p>
            )}

            {accounts === null ? (
              <div className="space-y-2">
                {[0, 1, 2].map((n) => (
                  <div key={n} className="h-24 rounded-2xl border border-border bg-surface/60 animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-sm text-text-dim">
                No accounts match.
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((account) => {
                  const open = selectedId === account.userId;
                  return (
                    <article
                      key={account.userId}
                      className={
                        open
                          ? 'rounded-2xl border border-purple/40 bg-surface px-4 py-4'
                          : 'rounded-2xl border border-border bg-surface px-4 py-4 hover:border-purple/30 transition-colors'
                      }
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedId(open ? null : account.userId)}
                        className="w-full text-left flex items-start justify-between gap-4"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-purple/15 text-[11px] font-semibold text-purple-light">
                            {initials(account)}
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold text-text truncate">
                              {account.name || account.email || account.userId}
                            </p>
                            <p className="text-sm text-text-muted truncate">
                              {account.email ?? 'No email on file'}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-[11px] text-text-muted">
                                {account.projectCount} projects
                              </span>
                              <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-[11px] text-text-muted">
                                {account.ownedWorkspaces.length} workspace
                                {account.ownedWorkspaces.length === 1 ? '' : 's'}
                              </span>
                              {account.stripeSubscriptionId && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-surface-elevated px-2 py-0.5 text-[11px] text-text-muted">
                                  <CreditCard size={11} aria-hidden /> Stripe
                                </span>
                              )}
                              {account.status === 'complimentary' && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-purple/15 px-2 py-0.5 text-[11px] text-purple-light">
                                  <Gift size={11} aria-hidden /> Comp
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <span
                          className={
                            account.plan === 'pro'
                              ? 'rounded-full bg-purple/15 px-2.5 py-0.5 text-[11px] font-medium text-purple-light'
                              : 'rounded-full bg-surface-elevated px-2.5 py-0.5 text-[11px] font-medium text-text-muted'
                          }
                        >
                          {account.plan === 'pro' ? 'Pro' : 'Free'}
                        </span>
                      </button>

                      {open && (
                        <div className="mt-4 border-t border-border-subtle pt-4 grid gap-4 sm:grid-cols-[1fr_auto]">
                          <div className="min-w-0 space-y-2 text-sm">
                            <Row label="User id">
                              <span className="font-mono text-[12px] text-text-muted break-all">{account.userId}</span>
                              <button
                                type="button"
                                onClick={() => void copyId(account.userId)}
                                className="ml-2 inline-flex items-center gap-1 text-[11px] text-text-dim hover:text-text"
                              >
                                {copied ? <Check size={12} /> : <Copy size={12} />}
                                {copied ? 'Copied' : 'Copy'}
                              </button>
                            </Row>
                            <Row label="Status">{account.status}</Row>
                            {formatPeriod(account.currentPeriodEnd) && (
                              <Row label="Period ends">{formatPeriod(account.currentPeriodEnd)}</Row>
                            )}
                            {account.stripeCustomerId && (
                              <Row label="Customer">
                                <span className="font-mono text-[12px] text-text-muted break-all">
                                  {account.stripeCustomerId}
                                </span>
                              </Row>
                            )}
                            {account.ownedWorkspaces.length > 0 && (
                              <Row label="Owns">
                                {account.ownedWorkspaces
                                  .map((workspace) => `${workspace.name} (${workspace.projects})`)
                                  .join(', ')}
                              </Row>
                            )}
                          </div>
                          <div className="flex sm:flex-col gap-1.5 sm:items-stretch">
                            <button
                              type="button"
                              disabled={busyId === account.userId || account.plan === 'pro'}
                              onClick={() => void setPlan(account.userId, 'pro')}
                              className="rounded-lg bg-purple px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
                            >
                              {busyId === account.userId ? 'Saving…' : 'Grant Pro'}
                            </button>
                            <button
                              type="button"
                              disabled={busyId === account.userId || account.plan === 'free'}
                              onClick={() => void setPlan(account.userId, 'free')}
                              className="rounded-lg border border-border px-3 py-2 text-xs text-text-muted hover:text-text disabled:opacity-40"
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
                                className="rounded-lg border border-danger/40 px-3 py-2 text-xs text-danger disabled:opacity-40"
                              >
                                Cancel Stripe
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busyId === account.userId}
                              onClick={() => void deleteUser(account)}
                              className="rounded-lg border border-danger/40 px-3 py-2 text-xs text-danger disabled:opacity-40"
                            >
                              Delete user
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-border bg-surface-elevated px-4 py-2 text-sm shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-text-dim">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone ?? 'text-text'}`}>{value}</p>
      <p className="mt-0.5 text-xs text-text-dim">{hint}</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-20 flex-shrink-0 pt-0.5 text-[11px] uppercase tracking-wider text-text-dim">
        {label}
      </span>
      <div className="min-w-0 text-text">{children}</div>
    </div>
  );
}
