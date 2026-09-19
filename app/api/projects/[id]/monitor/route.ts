import { NextResponse } from 'next/server';
import {
  deleteMonitor,
  getMonitorSnapshot,
  monitorStorageReady,
  saveMonitor,
} from '@/src/db/monitor-service';
import { projectErrorResponse } from '@/src/lib/project-errors';
import { requireScope } from '@/src/lib/request-scope';

type Ctx = { params: Promise<{ id: string }> };

/**
 * `available: false` rather than an error when the migration has not been
 * applied: monitoring is an addition to the project drawer, and an unapplied
 * migration should read as "not set up yet", not as a broken project.
 */
const UNAVAILABLE = NextResponse.json({ available: false, monitor: null });
const MONITOR_FALLBACK = 'Could not load or update uptime for this project. Please try again.';

export async function GET(req: Request, ctx: Ctx) {
  try {
    const scope = await requireScope(req);
    if (!(await monitorStorageReady())) return UNAVAILABLE;

    const snapshot = await getMonitorSnapshot(scope, (await ctx.params).id);
    return NextResponse.json({ available: true, ...snapshot });
  } catch (error) {
    return projectErrorResponse(error, MONITOR_FALLBACK);
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const scope = await requireScope(req);
    if (!(await monitorStorageReady())) return UNAVAILABLE;

    const monitor = await saveMonitor(scope, (await ctx.params).id, await req.json());
    return NextResponse.json({ available: true, monitor });
  } catch (error) {
    return projectErrorResponse(error, MONITOR_FALLBACK);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const scope = await requireScope(req);
    if (!(await monitorStorageReady())) return UNAVAILABLE;

    return NextResponse.json(await deleteMonitor(scope, (await ctx.params).id));
  } catch (error) {
    return projectErrorResponse(error, MONITOR_FALLBACK);
  }
}
