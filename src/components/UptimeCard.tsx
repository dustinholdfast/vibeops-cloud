'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import {
  apiCheckMonitorNow,
  apiDeleteMonitor,
  apiGetMonitor,
  apiSaveMonitor,
  ApiError,
} from '../lib/api';
import { cn } from '../lib/utils';
import type {
  Project,
  UptimeBucket,
  UptimeCheckResult,
  UptimeSnapshot,
  UptimeWindow,
} from '../types';

/**
 * Uptime for one project: the current state, a 24-hour strip, and the numbers
 * behind it.
 *
 * The strip is the point — a column per half hour, so a glance says whether
 * this was one blip or a bad afternoon, which a single "99.2%" cannot.
 */

const INTERVALS = [
  { value: 60, label: 'Every minute' },
  { value: 300, label: 'Every 5 minutes' },
  { value: 900, label: 'Every 15 minutes' },
  { value: 3600, label: 'Hourly' },
  { value: 86400, label: 'Daily' },
];

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

export function UptimeCard({ project }: { project: Project }) {
  const [snapshot, setSnapshot] = useState<UptimeSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UptimeCheckResult | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await apiGetMonitor(project.id);
      setSnapshot(next);
      setUrlDraft(next.monitor?.url ?? project.liveUrl ?? '');
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load uptime.');
    } finally {
      setLoading(false);
    }
  }, [project.id, project.liveUrl]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  async function save(body: Parameters<typeof apiSaveMonitor>[1]) {
    setBusy(true);
    setError(null);
    try {
      await apiSaveMonitor(project.id, body);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the monitor.');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Probes the target now. The snapshot is reloaded afterwards so the strip
   * and the uptime figures include the check that just ran.
   */
  async function checkNow() {
    setChecking(true);
    setError(null);
    try {
      setResult(await apiCheckMonitorNow(project.id));
      await load();
    } catch (err) {
      setResult(null);
      setError(err instanceof ApiError ? err.message : 'Could not run that check.');
    } finally {
      setChecking(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await apiDeleteMonitor(project.id);
      setShowSettings(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove the monitor.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-text-dim">
        <Loader2 size={14} className="animate-spin" aria-hidden />
        Loading uptime…
      </div>
    );
  }

  // The migration has not been applied on this deployment.
  if (snapshot && !snapshot.available) {
    return (
      <p className="text-sm text-text-dim">
        Uptime monitoring is not set up on this deployment yet.
      </p>
    );
  }

  const monitor = snapshot?.monitor ?? null;

  if (!monitor) {
    return (
      <div>
        <p className="text-sm text-text-muted">
          Ping this project on a schedule and get an email when it stops answering.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="url"
            inputMode="url"
            value={urlDraft}
            onChange={(event) => setUrlDraft(event.target.value)}
            placeholder="https://your-project.com"
            aria-label="URL to monitor"
            className="min-w-0 basis-full sm:basis-auto flex-1 rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-purple/50 focus:outline-none"
          />
          <button
            type="button"
            disabled={busy || !urlDraft.trim()}
            onClick={() => void save({ url: urlDraft.trim(), enabled: true })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-purple px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-dim disabled:opacity-50"
          >
            <Activity size={14} aria-hidden />
            Start monitoring
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      </div>
    );
  }

  const tone = STATUS_TONE[monitor.status];
  const buckets = snapshot?.buckets ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn('h-2 w-2 rounded-full', tone.dot)} aria-hidden />
          <span className={cn('text-sm font-medium', tone.text)}>{tone.label}</span>
          {!monitor.enabled && (
            <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-[11px] text-text-dim">
              Paused
            </span>
          )}
          <span className="text-xs text-text-dim">
            checked {formatWhen(monitor.lastCheckedAt)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void checkNow()}
            disabled={checking || busy}
            title="Check this project right now"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-text-muted transition-colors hover:text-text disabled:opacity-60"
          >
            <RefreshCw size={13} className={cn(checking && 'animate-spin')} aria-hidden />
            {checking ? 'Checking…' : 'Check now'}
          </button>
          <button
            type="button"
            onClick={() => setShowSettings((open) => !open)}
            aria-expanded={showSettings}
            className="rounded-lg px-2 py-1.5 text-xs text-text-dim transition-colors hover:text-text"
          >
            {showSettings ? 'Done' : 'Settings'}
          </button>
        </div>
      </div>

      {/* The answer to "is it up right now", before the strip below catches up. */}
      {result?.checkedAt && (
        <p
          role="status"
          className={cn(
            'rounded-lg border px-3 py-2 text-xs',
            result.ok
              ? 'border-success/40 bg-success/5 text-success'
              : 'border-danger/40 bg-danger/5 text-danger'
          )}
        >
          {result.ok ? 'Responding' : 'Not responding'}
          {result.statusCode ? ` · HTTP ${result.statusCode}` : ''}
          {/* Latency is real whether or not the status was healthy: a 401 came
              back, and how fast it came back is still worth seeing. */}
          {result.latencyMs != null ? ` · ${result.latencyMs}ms` : ''}
          {/* The probe's error for a bad status is just "HTTP <code>", which
              the line above already said. Only a transport failure — no status
              at all — carries a reason worth printing. */}
          {!result.statusCode && result.error ? ` · ${result.error}` : ''}
          {result.alert === 'down' ? ' · marked down' : ''}
          {result.alert === 'up' ? ' · recovered' : ''}
          {result.notified ? ` · emailed ${result.notified}` : ''}
        </p>
      )}

      {/* One column per half hour of the last day. */}
      <div className="flex h-7 items-stretch gap-[2px]" role="img" aria-label="Uptime over the last 24 hours">
        {buckets.map((bucket) => (
          <div
            key={bucket.start}
            title={bucketTitle(bucket)}
            className={cn('flex-1 rounded-[2px]', BUCKET_TONE[bucket.state])}
          />
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-text-dim">
        <span>24 hours ago</span>
        <span>now</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ['24h', snapshot?.windows?.day],
            ['7d', snapshot?.windows?.week],
            ['30d', snapshot?.windows?.month],
          ] as const
        ).map(([label, window]) => (
          <div key={label} className="rounded-lg border border-border bg-surface-elevated p-2.5">
            <p className="text-[11px] uppercase tracking-wider text-text-dim">{label}</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-text">
              {formatPct(window)}
            </p>
            <p className="text-[11px] text-text-dim">
              {window?.checks ? `${window.checks} checks` : 'no checks'}
            </p>
          </div>
        ))}
      </div>

      {snapshot?.windows?.day?.avgLatencyMs != null && (
        <p className="text-xs text-text-dim">
          Average response {snapshot.windows.day.avgLatencyMs}ms over the last 24 hours.
        </p>
      )}

      {monitor.status === 'down' && monitor.lastError && (
        <p className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
          {monitor.lastError}
        </p>
      )}

      {showSettings && (
        <div className="space-y-2 rounded-lg border border-border bg-surface-elevated p-3">
          <label className="block text-[11px] uppercase tracking-wider text-text-dim" htmlFor={`monitor-url-${project.id}`}>
            URL
          </label>
          <input
            id={`monitor-url-${project.id}`}
            type="url"
            inputMode="url"
            value={urlDraft}
            onChange={(event) => setUrlDraft(event.target.value)}
            onBlur={() => {
              if (urlDraft.trim() && urlDraft.trim() !== monitor.url) {
                void save({ url: urlDraft.trim() });
              }
            }}
            disabled={busy}
            className="w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-purple/50 focus:outline-none"
          />
          <p className="text-[11px] text-text-dim">
            Changing the URL clears the history — it would be measuring something else.
          </p>

          <label className="block pt-1 text-[11px] uppercase tracking-wider text-text-dim" htmlFor={`monitor-interval-${project.id}`}>
            Check every
          </label>
          <select
            id={`monitor-interval-${project.id}`}
            value={monitor.intervalSeconds}
            disabled={busy}
            onChange={(event) => void save({ intervalSeconds: Number(event.target.value) })}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-purple/50 focus:outline-none"
          >
            {INTERVALS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void save({ enabled: !monitor.enabled })}
              className="rounded-lg border border-border px-3 py-2 text-sm text-text-muted transition-colors hover:text-text disabled:opacity-50"
            >
              {monitor.enabled ? 'Pause checks' : 'Resume checks'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove()}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
            >
              <Trash2 size={14} aria-hidden />
              Stop monitoring
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
