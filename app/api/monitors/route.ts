import { NextResponse } from 'next/server';
import { listWorkspaceUptime, monitorStorageReady } from '@/src/db/monitor-service';
import { projectErrorResponse } from '@/src/lib/project-errors';
import { requireScope } from '@/src/lib/request-scope';

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
    return projectErrorResponse(error);
  }
}
