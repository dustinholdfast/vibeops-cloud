import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { monitorStorageReady } from '@/src/db/monitor-service';
import { withDb } from '@/src/db';
import { projects } from '@/src/db/schema';
import { dbProjectToDomain } from '@/src/db/map';
import { env } from '@/src/lib/env';

/**
 * Cheap liveness by default. `?deep=1` also probes monitor storage — useful
 * after a hosting change, but not on every heartbeat: a wedged DB connection
 * would otherwise take the health check (and its isolate) down with it.
 *
 * `?deep=1&projects=1` with `Authorization: Bearer $CUTOVER_PROBE_SECRET`
 * runs the same projects select + domain mapping `/api/projects` uses, so a
 * Hyperdrive/DB cutover can be verified before asking a human to hard-refresh.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const deep = url.searchParams.get('deep') === '1';
  const projectsProbe = url.searchParams.get('projects') === '1';
  const workspaceId = url.searchParams.get('workspaceId');

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

  let projectsReady: boolean | 'unauthorized' | 'skipped' | 'unreachable' = 'skipped';
  let projectsCount: number | undefined;
  let projectsError: string | undefined;
  let projectIds: string[] | undefined;

  if (deep && projectsProbe) {
    const expected = env('CUTOVER_PROBE_SECRET');
    const auth = req.headers.get('authorization') ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!expected || token !== expected) {
      projectsReady = 'unauthorized';
    } else if (!workspaceId) {
      projectsReady = 'unreachable';
      projectsError = 'workspaceId query param required';
    } else {
      try {
        const rows = await withDb((db) =>
          db
            .select()
            .from(projects)
            .where(eq(projects.workspaceId, workspaceId))
            .orderBy(desc(projects.lastTouched))
        );
        // Same mapping `/api/projects` runs — this is what previously 503'd.
        const mapped = rows.map(dbProjectToDomain);
        projectsReady = true;
        projectsCount = mapped.length;
        projectIds = mapped.map((p) => p.id);
      } catch (error) {
        projectsReady = 'unreachable';
        const message = error instanceof Error ? error.message : String(error);
        const name = error instanceof Error ? error.name : 'Error';
        projectsError = `${name}: ${message}`.slice(0, 300);
        console.error('[health] projects probe failed', projectsError);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    service: 'noxen',
    phase: 3,
    hasDatabase: Boolean(env('DATABASE_URL')),
    hasClerk: Boolean(env('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY') && env('CLERK_SECRET_KEY')),
    hasCronSecret: Boolean(env('CRON_SECRET')),
    ...(deep
      ? {
          monitorsReady,
          ...(monitorsError ? { monitorsError } : {}),
          ...(projectsProbe
            ? {
                projectsReady,
                ...(projectsCount !== undefined ? { projectsCount } : {}),
                ...(projectIds ? { projectIds } : {}),
                ...(projectsError ? { projectsError } : {}),
              }
            : {}),
        }
      : {}),
  });
}
