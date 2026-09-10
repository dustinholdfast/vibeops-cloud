import { NextResponse } from 'next/server';
import { listWorkspaceUptime, monitorStorageReady } from '@/src/db/monitor-service';
import { projectErrorResponse } from '@/src/lib/project-errors';
import { requireScope } from '@/src/lib/request-scope';
import { ProjectError } from '@/src/lib/project-validation';

/**
 * Every monitor in the active workspace, with its history — the portfolio
 * uptime view. Scoped by membership like every other project read.
 */
export async function GET(req: Request) {
  try {
    const scope = await requireScope(req);

    if (!(await monitorStorageReady())) {
      return NextResponse.json({ available: false, monitored: [], unmonitored: [] });
    }

    return NextResponse.json({ available: true, ...(await listWorkspaceUptime(scope)) });
  } catch (error) {
    // Auth and scope failures carry their own message and should keep it.
    if (error instanceof ProjectError) return projectErrorResponse(error);

    // Anything else is this endpoint's own fault. The shared handler would say
    // "could not save or load your projects", which is not what this page is.
    console.error('[monitors] request failed', error);
    return NextResponse.json(
      { error: 'Could not load uptime just now. Please try again.', code: 'UPTIME_UNAVAILABLE' },
      { status: 503 }
    );
  }
}
