import { NextResponse } from 'next/server';
import { monitorStorageReady } from '@/src/db/monitor-service';

/**
 * Cheap liveness by default. `?deep=1` also probes monitor storage — useful
 * after a hosting change, but not on every heartbeat: a wedged DB connection
 * would otherwise take the health check (and its isolate) down with it.
 */
export async function GET(req: Request) {
  const deep = new URL(req.url).searchParams.get('deep') === '1';

  let monitorsReady: boolean | 'unreachable' | 'skipped' = 'skipped';
  if (deep && process.env.DATABASE_URL) {
    try {
      monitorsReady = await monitorStorageReady();
    } catch {
      monitorsReady = 'unreachable';
    }
  }

  return NextResponse.json({
    ok: true,
    service: 'vibeops-cloud',
    phase: 3,
    hasDatabase: Boolean(process.env.DATABASE_URL),
    hasClerk: Boolean(
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
    ),
    hasCronSecret: Boolean(process.env.CRON_SECRET),
    ...(deep ? { monitorsReady } : {}),
  });
}
