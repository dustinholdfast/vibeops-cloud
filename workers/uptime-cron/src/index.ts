/**
 * Schedules VibeOps Cloud cron routes.
 *
 * On workers.dev, same-zone Worker-to-Worker via global fetch returns Cloudflare
 * 1042 unless `global_fetch_strictly_public` is set — that flag is in
 * wrangler.jsonc. A VIBEOPS service binding is an alternative path used when
 * present; either way this Worker stays a scheduler and nothing more.
 *
 * Two triggers share this Worker so digest mail does not depend on Vercel Cron:
 *   */5 * * * *   uptime sweep
 *   0 13 * * 1    weekly digest (Monday 13:00 UTC)
 */

export type Env = {
  APP_URL?: string;
  CRON_SECRET?: string;
  VIBEOPS?: Fetcher;
};

const TIMEOUT_MS = 90_000;

export const JOBS = {
  uptime: { cron: '*/5 * * * *', path: '/api/cron/uptime?send=1' },
  digest: { cron: '0 13 * * 1', path: '/api/cron/weekly-digest?send=1' },
} as const;

export type JobName = keyof typeof JOBS;

function jobForCron(expr: string): JobName {
  if (expr === JOBS.digest.cron) return 'digest';
  return 'uptime';
}

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

async function runJob(
  env: Env,
  job: JobName
): Promise<{ ok: true; job: JobName; elapsedMs: number; via: string; body: unknown }> {
  const cfg = configured(env);
  if (!cfg.ok) {
    throw new Error(`${cfg.missing.join(' and ')} must be configured.`);
  }

  const url = `${cfg.appUrl}${JOBS[job].path}`;
  const startedAt = Date.now();
  const request = new Request(url, {
    method: 'GET',
    headers: { authorization: `Bearer ${cfg.secret}` },
  });

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
    throw new Error(`${job} returned ${response.status} after ${elapsed}ms: ${detail}`);
  }

  const body = (await response.json().catch(() => ({}))) as unknown;
  return { ok: true, job, elapsedMs: elapsed, via, body };
}

export default {
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    const job = jobForCron(event.cron);
    ctx.waitUntil(
      runJob(env, job)
        .then((result) => {
          console.log(JSON.stringify(result));
        })
        .catch((error) => {
          console.error(`[cron:${job}]`, error instanceof Error ? error.message : error);
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
        jobs: JOBS,
      });
    }

    const manual: Record<string, JobName> = {
      '/run': 'uptime',
      '/run-digest': 'digest',
    };
    const job = request.method === 'POST' ? manual[pathname] : undefined;
    if (job) {
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
        const result = await runJob(env, job);
        console.log(JSON.stringify({ ...result, trigger: 'fetch' }));
        return Response.json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[cron:${job}]`, message);
        return Response.json({ ok: false, error: message }, { status: 502 });
      }
    }

    return new Response('Not found', { status: 404 });
  },
};
