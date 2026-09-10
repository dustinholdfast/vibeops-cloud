/**
 * Calls the VibeOps uptime sweep on a schedule.
 *
 * This exists because GitHub Actions will not do it. Its scheduled workflows
 * are best-effort on shared runners, and in practice this repository saw two
 * runs in seven hours against a five-minute schedule — a monitor that checks
 * twice a day is not a monitor. Cloudflare cron triggers fire on time, and are
 * free.
 *
 * The Worker holds no monitoring logic of its own. VibeOps decides which
 * monitors are due, so this stays a scheduler and nothing more; a late or
 * duplicated call is harmless.
 */

export type Env = {
  /** Production origin, no trailing path. A var or a secret; both are read the same way. */
  APP_URL?: string;
  /** Shared with the VibeOps deployment. Every /api/cron/* route refuses to run without it. */
  CRON_SECRET?: string;
};

/** Longer than the sweep's own budget, so a slow run is not cut off here. */
const TIMEOUT_MS = 90_000;

type SweepResult = {
  checked?: number;
  down?: number;
  alerts?: number;
  mode?: string;
};

async function runSweep(env: Env): Promise<void> {
  if (!env.APP_URL || !env.CRON_SECRET) {
    // Loud rather than silent: a scheduler that cannot reach anything should
    // not look like one that found nothing to do.
    throw new Error('APP_URL and CRON_SECRET must both be configured.');
  }

  const url = `${env.APP_URL.replace(/\/+$/, '')}/api/cron/uptime?send=1`;
  const startedAt = Date.now();

  const response = await fetch(url, {
    method: 'GET',
    headers: { authorization: `Bearer ${env.CRON_SECRET}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const elapsed = Date.now() - startedAt;

  if (!response.ok) {
    // 401 means the secret does not match the deployment; 503 usually means
    // the uptime migration has not been applied.
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    throw new Error(`Sweep returned ${response.status} after ${elapsed}ms: ${detail}`);
  }

  const body = (await response.json().catch(() => ({}))) as SweepResult;

  console.log(
    JSON.stringify({
      ok: true,
      elapsedMs: elapsed,
      mode: body.mode ?? 'unknown',
      checked: body.checked ?? 0,
      down: body.down ?? 0,
      alerts: body.alerts ?? 0,
    })
  );
}

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    // waitUntil keeps the invocation alive for the whole request; without it a
    // slow sweep can be cancelled when the handler returns.
    ctx.waitUntil(
      runSweep(env).catch((error) => {
        console.error('[uptime-cron]', error instanceof Error ? error.message : error);
        // Rethrowing would mark the cron invocation failed in the dashboard,
        // which is what we want to see when something is wrong.
        throw error;
      })
    );
  },
};
