import { NextResponse } from 'next/server';
import { monitorStorageReady } from '@/src/db/monitor-service';
import { env } from '@/src/lib/env';

/**
 * Cheap liveness by default. `?deep=1` also probes monitor storage — useful
 * after a hosting change, but not on every heartbeat: a wedged DB connection
 * would otherwise take the health check (and its isolate) down with it.
 */
export async function GET(req: Request) {
  const deep = new URL(req.url).searchParams.get('deep') === '1';

  let monitorsReady: boolean | 'unreachable' | 'skipped' = 'skipped';
  let monitorsError: string | undefined;
  if (deep && env('DATABASE_URL')) {
    try {
      monitorsReady = await monitorStorageReady();
    } catch (error) {
      monitorsReady = 'unreachable';
      const message = error instanceof Error ? error.message : String(error);
      const name = error instanceof Error ? error.name : 'Error';
      monitorsError = `${name}: ${message}`.slice(0, 300);
      console.error('[health] deep monitor probe failed', monitorsError);
    }
  }

  return NextResponse.json({
    ok: true,
    service: 'noxen',
    phase: 3,
    hasDatabase: Boolean(env('DATABASE_URL')),
    hasClerk: Boolean(env('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY') && env('CLERK_SECRET_KEY')),
    hasCronSecret: Boolean(env('CRON_SECRET')),
    ...(deep ? { monitorsReady, ...(monitorsError ? { monitorsError } : {}) } : {}),
  });
}
