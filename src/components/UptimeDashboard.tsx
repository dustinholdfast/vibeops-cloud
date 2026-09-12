'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { Activity, LayoutDashboard, Loader2, Moon, RefreshCw, Sun } from 'lucide-react';
import { apiListUptime, ApiError } from '../lib/api';
import { useTheme } from '../lib/useTheme';
import { cn } from '../lib/utils';
import type { UptimeBucket, UptimeRow, UptimeWindow, WorkspaceUptime } from '../types';

/**
 * Portfolio uptime: every monitored project in the workspace, at a glance.
 *
 * The headline answers the only question most visits have — is anything
 * broken right now — and each row carries the 24-hour strip, because "99.2%"
 * cannot distinguish one bad hour from a fortnight of flapping.
 */

/** Kept in step with the checks themselves, which run every few minutes. */
const AUTO_REFRESH_MS = 60_000;

const BUCKET_TONE: Record<UptimeBucket['state'], string> = {
  none: 'bg-border-subtle',
  up: 'bg-success/70',
  degraded: 'bg-warning',
  down: 'bg-danger',
};

const STATUS_TONE = {
  up: { dot: 'bg-success', text: 'text-success', label: 'Up' },
  down: { dot: 'bg-danger', text: 'text-danger', label: 'Down' },
  unknown: { dot: 'bg-text-dim', text: 'text-text-dim', label: 'Not checked yet' },
} as const;

function formatPct(window: UptimeWindow | undefined): string {
  if (!window || window.uptimePct === null) return '—';
  return `${window.uptimePct}%`;
}

function formatWhen(iso: string | null): string {
  if (!iso) return 'never';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function bucketTitle(bucket: UptimeBucket): string {
  const at = new Date(bucket.start).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  if (bucket.total === 0) return `${at} — no checks`;
  if (bucket.failed === 0) return `${at} — ${bucket.total} checks, all up`;
  return `${at} — ${bucket.failed} of ${bucket.total} checks failed`;
}

/** The one-line verdict, in Downdetector terms. */
function headline(rows: UptimeRow[]): { text: string; tone: string; dot: string } {
  const active = rows.filter((row) => row.enabled);
  const down = active.filter((row) => row.status === 'down');

  if (rows.length === 0) {
    return { text: 'Nothing is being monitored', tone: 'text-text-muted', dot: 'bg-text-dim' };
  }
  if (down.length > 0) {
    return {
      text:
        down.length === 1
          ? `${down[0].projectName} is down`
          : `${down.length} projects are down`,
      tone: 'text-danger',
      dot: 'bg-danger',
    };
  }
  if (active.length === 0) {
    return { text: 'All monitors are paused', tone: 'text-warning', dot: 'bg-warning' };
  }
  if (active.every((row) => row.status === 'unknown')) {
    return { text: 'Waiting for the first check', tone: 'text-text-muted', dot: 'bg-text-dim' };
  }
  return { text: 'All systems operational', tone: 'text-success', dot: 'bg-success' };
}

function ProjectRow({ row }: { row: UptimeRow }) {
  const tone = STATUS_TONE[row.status];

  return (
    <div className="border-b border-border-subtle p-4 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn('h-2 w-2 flex-shrink-0 rounded-full', tone.dot)} aria-hidden />
            <span className="truncate font-medium text-text">{row.projectName}</span>
            <span className={cn('text-xs', tone.text)}>{tone.label}</span>
            {!row.enabled && (
              <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-[11px] text-text-dim">
                Paused
              </span>
            )}
          </div>
          <a
            href={row.url}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 block truncate text-xs text-text-dim hover:text-purple-light"
          >
            {row.url}
          </a>
        </div>

        <div className="flex items-center gap-4 text-right tabular-nums">
          {(
            [
              ['24h', row.windows.day],
              ['7d', row.windows.week],
              ['30d', row.windows.month],
            ] as const
          ).map(([label, window]) => (
            <div key={label}>
              <p className="text-[10px] uppercase tracking-wider text-text-dim">{label}</p>
              <p className="text-sm font-semibold text-text">{formatPct(window)}</p>
            </div>
          ))}
        </div>
      </div>

      <div
        className="mt-3 flex h-5 items-stretch gap-[2px]"
        role="img"
        aria-label={`${row.projectName} uptime over the last 24 hours`}
      >
        {row.buckets.map((bucket) => (
          <div
            key={bucket.start}
            title={bucketTitle(bucket)}
            className={cn('flex-1 rounded-[2px]', BUCKET_TONE[bucket.state])}
          />
        ))}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 text-[11px] text-text-dim">
        <span>checked {formatWhen(row.lastCheckedAt)}</span>
        {row.windows.day.avgLatencyMs != null && (
          <span>{row.windows.day.avgLatencyMs}ms average</span>
        )}
        <span>every {Math.round(row.intervalSeconds / 60)}m</span>
      </div>

      {row.status === 'down' && row.lastError && (
        <p className="mt-2 rounded-lg border border-danger/40 bg-danger/5 px-3 py-1.5 text-xs text-danger">
          {row.lastError}
        </p>
      )}
    </div>
  );
}

export function UptimeDashboard() {
  const [data, setData] = useState<WorkspaceUptime | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const load = useCallback(async () => {
    try {
      setData(await apiListUptime());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load uptime.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The numbers go stale on their own, so the page keeps itself current.
  useEffect(() => {
    const timer = setInterval(() => void load(), AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const rows = data?.monitored ?? [];
  const verdict = headline(rows);

  return (
    <div className="min-h-full bg-background text-text">
      <header className="border-b border-border-subtle">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" width={28} height={28} className="h-7 w-7 rounded-full" />
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wider text-text-dim">Noxen</p>
              <h1 className="text-lg font-semibold tracking-tight">Uptime</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setRefreshing(true);
                void load();
              }}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-muted hover:text-text disabled:opacity-60"
            >
              <RefreshCw size={14} className={cn(refreshing && 'animate-spin')} aria-hidden />
              Refresh
            </button>
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
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-text-muted hover:text-text"
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <UserButton afterSignOutUrl="/" appearance={{ elements: { avatarBox: 'w-8 h-8' } }} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6 pb-16">
        {loading ? (
          <div className="flex items-center gap-2 py-16 text-sm text-text-dim">
            <Loader2 size={16} className="animate-spin" aria-hidden />
            Loading uptime…
          </div>
        ) : data && !data.available ? (
          <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center">
            <Activity className="mx-auto text-text-dim" size={22} aria-hidden />
            <h2 className="mt-3 text-base font-semibold">Monitoring is not set up</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-text-muted">
              This deployment has not had the uptime migration applied yet.
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-border bg-surface p-5">
              <div className="flex items-center gap-2.5">
                <span className={cn('h-2.5 w-2.5 rounded-full', verdict.dot)} aria-hidden />
                <h2 className={cn('text-lg font-semibold tracking-tight', verdict.tone)}>
                  {verdict.text}
                </h2>
              </div>
              <p className="mt-1 text-sm text-text-dim">
                {rows.filter((r) => r.enabled && r.status === 'up').length} up ·{' '}
                {rows.filter((r) => r.enabled && r.status === 'down').length} down ·{' '}
                {rows.filter((r) => !r.enabled).length} paused ·{' '}
                {data?.unmonitored.length ?? 0} not monitored
              </p>
            </div>

            {error && (
              <p role="alert" className="mt-4 text-sm text-danger">
                {error}
              </p>
            )}

            {rows.length > 0 ? (
              <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface">
                {rows.map((row) => (
                  <ProjectRow key={row.projectId} row={row} />
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-border px-6 py-14 text-center">
                <Activity className="mx-auto text-text-dim" size={22} aria-hidden />
                <h3 className="mt-3 text-base font-semibold">No monitors yet</h3>
                <p className="mx-auto mt-1 max-w-md text-sm text-text-muted">
                  Open a project on the dashboard and start monitoring it from the Uptime
                  section of its drawer.
                </p>
                <Link
                  href="/dashboard"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-purple px-3 py-2 text-sm font-medium text-white hover:bg-purple-dim"
                >
                  <LayoutDashboard size={14} aria-hidden />
                  Go to the dashboard
                </Link>
              </div>
            )}

            {data && data.unmonitored.length > 0 && (
              <section className="mt-6">
                <h3 className="text-[11px] uppercase tracking-wider text-text-dim">
                  Not monitored
                </h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {data.unmonitored.map((project) => (
                    <span
                      key={project.id}
                      className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-muted"
                      title={project.liveUrl ?? 'No live URL set'}
                    >
                      {project.name}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs text-text-dim">
                  Add a monitor from a project&apos;s drawer on the dashboard.
                </p>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
