import { NextResponse } from 'next/server';
import {
  alertRecipients,
  dueMonitors,
  monitorStorageReady,
  pruneChecks,
  recordCheck,
  type DueMonitor,
} from '@/src/db/monitor-service';
import { applyProbe, type Transition } from '@/src/lib/uptime/status';
import { probe } from '@/src/lib/uptime/probe';
import { sendAlerts } from '@/src/lib/uptime/alerting';
import { isEmailConfigured } from '@/src/lib/email/send';

/**
 * Runs every monitor that is due.
 *
 * Safe by default, like the weekly digest: without `?send=1` this performs the
 * checks and reports exactly what it found and who it would email, but writes
 * nothing. That matters more here than it does for the digest — recording a
 * check consumes the up/down transition, so a dry run that wrote state would
 * swallow the very alert it was meant to preview.
 *
 * Being due is decided per monitor from its own interval, so this endpoint is
 * safe to call as often as any scheduler likes.
 */

export const maxDuration = 60;

/** Monitors considered per invocation. */
const BATCH_LIMIT = 100;

/** Probes in flight at once. Enough to be quick, few enough to be polite. */
const CONCURRENCY = 8;

/**
 * Stop starting new probes after this long, leaving room to finish the ones in
 * flight and respond inside `maxDuration`. Whatever is skipped is still due on
 * the next run, so a large account drains over a few invocations rather than
 * timing out on every one.
 */
const DISPATCH_BUDGET_MS = 40_000;

type Outcome = {
  projectId: string;
  projectName: string;
  url: string;
  ok: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  error: string | null;
  status: Transition['status'];
  alert: Transition['alert'];
  notified: string[];
};

function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Refuse rather than run unauthenticated if no secret is configured.
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

/**
 * Maps over `items` with a fixed number of workers, stopping once `deadline`
 * has passed. Returns only the results it actually produced.
 */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  deadline: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;

  async function run() {
    while (cursor < items.length && Date.now() < deadline) {
      const item = items[cursor];
      cursor += 1;
      results.push(await worker(item));
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

/** Emails everyone who should hear about a state change. */
async function notify(
  monitor: DueMonitor,
  transition: Transition,
  outcome: { error: string | null },
  appUrl: string,
  now: Date
): Promise<string[]> {
  const kind = transition.alert;
  if (!kind) return [];

  return sendAlerts({
    recipients: await alertRecipients(monitor.workspaceId),
    kind,
    projectName: monitor.projectName,
    url: monitor.url,
    error: outcome.error,
    downForMs:
      kind === 'up' && monitor.lastStatusChangeAt
        ? now.getTime() - monitor.lastStatusChangeAt.getTime()
        : null,
    appUrl,
  });
}

export async function GET(req: Request) {
  if (!authorised(req)) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const url = new URL(req.url);
  const send = url.searchParams.get('send') === '1';

  if (!(await monitorStorageReady())) {
    return NextResponse.json(
      {
        error: 'project_monitors is missing. Apply scripts/uptime-monitors.sql.',
        code: 'MIGRATION_REQUIRED',
      },
      { status: 503 }
    );
  }

  const now = new Date();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;

  try {
    const due = await dueMonitors(now, BATCH_LIMIT);
    const deadline = Date.now() + DISPATCH_BUDGET_MS;

    const outcomes = await mapLimit(due, CONCURRENCY, deadline, async (monitor): Promise<Outcome> => {
      const result = await probe(monitor.url, monitor.timeoutMs);
      const transition = applyProbe(
        {
          status: monitor.status,
          consecutiveFailures: monitor.consecutiveFailures,
          consecutiveSuccesses: monitor.consecutiveSuccesses,
        },
        result,
        monitor.failureThreshold
      );

      let notified: string[] = [];

      // Stamped when the probe finished, not when the run started: a sweep can
      // take most of a minute, and the history should say when each check
      // actually happened.
      const checkedAt = new Date();

      if (send) {
        await recordCheck(monitor.projectId, result, transition, checkedAt);
        if (transition.alert) {
          notified = await notify(monitor, transition, result, appUrl, checkedAt).catch((error) => {
            console.error('[uptime] alerting failed', monitor.projectId, error);
            return [];
          });
        }
      }

      return {
        projectId: monitor.projectId,
        projectName: monitor.projectName,
        url: monitor.url,
        ok: result.ok,
        statusCode: result.statusCode,
        latencyMs: result.latencyMs,
        error: result.error,
        status: transition.status,
        alert: transition.alert,
        notified,
      };
    });

    const pruned = send ? await pruneChecks(now) : 0;

    return NextResponse.json({
      ok: true,
      mode: send ? 'send' : 'dry-run',
      emailConfigured: isEmailConfigured(),
      due: due.length,
      checked: outcomes.length,
      /** Ran out of time; these are still due on the next invocation. */
      deferred: due.length - outcomes.length,
      down: outcomes.filter((o) => !o.ok).length,
      alerts: outcomes.filter((o) => o.alert).length,
      prunedChecks: pruned,
      outcomes,
    });
  } catch (error) {
    console.error('[uptime] run failed', error);
    return NextResponse.json(
      { error: 'The uptime run failed.', code: 'UPTIME_RUN_FAILED' },
      { status: 500 }
    );
  }
}
