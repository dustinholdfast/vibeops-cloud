/**
 * Calls the VibeOps uptime sweep on a schedule.
 *
 * On workers.dev, same-zone Worker-to-Worker via global fetch returns Cloudflare
 * 1042 unless `global_fetch_strictly_public` is set — that flag is in
 * wrangler.jsonc. A VIBEOPS service binding is an alternative path used when
 * present; either way this Worker stays a scheduler and nothing more.
 */

export type Env = {
  APP_URL?: string;
  CRON_SECRET?: string;
  VIBEOPS?: Fetcher;
};

const TIMEOUT_MS = 90_000;

type SweepResult = {
  checked?: number;
  down?: number;
  alerts?: number;
  mode?: string;
  due?: number;
  deferred?: number;
};

function configured(
  env: Env
):
  | { ok: true; appUrl: string; secret: string }
  | { ok: false; missing: string[] } {
  const missing: string[] = [];
  if (!env.CRON_SECRET) missing.push('CRON_SECRET');
  if (!env.APP_URL && !env.VIBEOPS) missing.push('APP_URL');
  if (missing.length) return { ok: false, missing };
  return {
    ok: true,
    appUrl: (env.APP_URL ?? 'https://vibeops-cloud.internal').replace(/\/+$/, ''),
    secret: env.CRON_SECRET!,
  };
}

async function runSweep(
  env: Env
): Promise<SweepResult & { ok: true; elapsedMs: number; via: string }> {
  const cfg = configured(env);
  if (!cfg.ok) {
    throw new Error(`${cfg.missing.join(' and ')} must be configured.`);
  }

  const url = `${cfg.appUrl}/api/cron/uptime?send=1`;
  const startedAt = Date.now();
  const request = new Request(url, {
    method: 'GET',
    headers: { authorization: `Bearer ${cfg.secret}` },
  });

  // Prefer public fetch when APP_URL is set. With
  // global_fetch_strictly_public this reaches the other Worker on workers.dev
  // instead of error 1042. Fall back to the service binding when APP_URL is
  // absent (custom wiring).
  let via = 'url';
  let response: Response;
  if (env.APP_URL) {
    response = await fetch(request, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } else if (env.VIBEOPS) {
    via = 'binding';
    response = await env.VIBEOPS.fetch(request);
  } else {
    throw new Error('APP_URL or VIBEOPS must be configured.');
  }

  const elapsed = Date.now() - startedAt;

  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    throw new Error(`Sweep returned ${response.status} after ${elapsed}ms: ${detail}`);
  }

  const body = (await response.json().catch(() => ({}))) as SweepResult;

  return {
    ok: true,
    elapsedMs: elapsed,
    via,
    mode: body.mode ?? 'unknown',
    checked: body.checked ?? 0,
    down: body.down ?? 0,
    alerts: body.alerts ?? 0,
    due: body.due,
    deferred: body.deferred,
  };
}

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      runSweep(env)
        .then((result) => {
          console.log(JSON.stringify(result));
        })
        .catch((error) => {
          console.error('[uptime-cron]', error instanceof Error ? error.message : error);
          throw error;
        })
    );
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === 'GET' && (pathname === '/' || pathname === '')) {
      const cfg = configured(env);
      if (!cfg.ok) {
        return Response.json(
          { ok: false, configured: false, missing: cfg.missing },
          { status: 503 }
        );
      }
      return Response.json({
        ok: true,
        configured: true,
        appUrl: cfg.appUrl,
        hasCronSecret: true,
        hasServiceBinding: Boolean(env.VIBEOPS),
      });
    }

    if (request.method === 'POST' && pathname === '/run') {
      const cfg = configured(env);
      if (!cfg.ok) {
        return Response.json(
          { ok: false, error: `${cfg.missing.join(' and ')} must be configured.` },
          { status: 503 }
        );
      }
      if (request.headers.get('authorization') !== `Bearer ${cfg.secret}`) {
        return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
      }
      try {
        const result = await runSweep(env);
        console.log(JSON.stringify({ ...result, trigger: 'fetch' }));
        return Response.json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[uptime-cron]', message);
        return Response.json({ ok: false, error: message }, { status: 502 });
      }
    }

    return new Response('Not found', { status: 404 });
  },
};
