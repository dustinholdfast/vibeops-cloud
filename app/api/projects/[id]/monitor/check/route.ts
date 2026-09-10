import { NextResponse } from 'next/server';
import {
  alertRecipients,
  monitorForCheck,
  monitorStorageReady,
  recordCheck,
} from '@/src/db/monitor-service';
import { applyProbe } from '@/src/lib/uptime/status';
import { probe } from '@/src/lib/uptime/probe';
import { sendAlerts } from '@/src/lib/uptime/alerting';
import { projectErrorResponse } from '@/src/lib/project-errors';
import { requireScope } from '@/src/lib/request-scope';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Checks one project right now, on demand.
 *
 * Deliberately the same pipeline as the scheduled sweep — probe, fold into the
 * state machine, record, alert on a transition. A person clicking a button and
 * the cron waking up are discovering the same fact about the world, so they
 * must not produce different history or different alerts.
 *
 * Alerting on a manual check matters most for the case it would be tempting to
 * skip: recording a check consumes the up/down transition, so a manual check
 * that stayed silent would swallow the alert the next scheduled run would
 * otherwise have sent. Only transitions alert, and `monitorForCheck` enforces
 * a cooldown, so the button cannot be turned into a mailing list.
 */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const scope = await requireScope(req);

    if (!(await monitorStorageReady())) {
      return NextResponse.json({ available: false, monitor: null });
    }

    const now = new Date();
    const monitor = await monitorForCheck(scope, (await ctx.params).id, now);

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

    const checkedAt = new Date();
    await recordCheck(monitor.projectId, result, transition, checkedAt);

    let notified: string[] = [];
    if (transition.alert) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
      notified = await sendAlerts({
        recipients: await alertRecipients(monitor.workspaceId),
        kind: transition.alert,
        projectName: monitor.projectName,
        url: monitor.url,
        error: result.error,
        downForMs:
          transition.alert === 'up' && monitor.lastStatusChangeAt
            ? checkedAt.getTime() - monitor.lastStatusChangeAt.getTime()
            : null,
        appUrl,
      }).catch((error) => {
        // The check itself succeeded; a mail failure must not report it as one.
        console.error('[uptime] manual check alerting failed', monitor.projectId, error);
        return [];
      });
    }

    return NextResponse.json({
      available: true,
      checkedAt: checkedAt.toISOString(),
      ok: result.ok,
      statusCode: result.statusCode,
      latencyMs: result.latencyMs,
      error: result.error,
      status: transition.status,
      alert: transition.alert,
      notified: notified.length,
    });
  } catch (error) {
    return projectErrorResponse(error);
  }
}
