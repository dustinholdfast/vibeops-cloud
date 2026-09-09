import { NextResponse } from 'next/server';
import { getOrCreatePreferences, setWeeklyDigest } from '@/src/db/digest-service';
import {
  alertStorageReady,
  getUptimeAlerts,
  setUptimeAlerts,
} from '@/src/db/monitor-service';
import { projectErrorResponse } from '@/src/lib/project-errors';
import { requireUserId } from '@/src/lib/request-scope';
import { ProjectError } from '@/src/lib/project-validation';

export async function GET() {
  try {
    const userId = await requireUserId();
    const prefs = await getOrCreatePreferences(userId);

    // Reported as unavailable rather than defaulted, so the UI can hide the
    // control instead of offering a switch that would not persist.
    const alertsReady = await alertStorageReady();

    return NextResponse.json({
      weeklyDigest: prefs.weeklyDigest === 1,
      uptimeAlerts: alertsReady ? await getUptimeAlerts(userId) : null,
    });
  } catch (error) {
    return projectErrorResponse(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const userId = await requireUserId();
    const body = (await req.json()) as { weeklyDigest?: unknown; uptimeAlerts?: unknown };

    if (typeof body.weeklyDigest === 'boolean') {
      return NextResponse.json(await setWeeklyDigest(userId, body.weeklyDigest));
    }

    if (typeof body.uptimeAlerts === 'boolean') {
      if (!(await alertStorageReady())) {
        throw new ProjectError(
          503,
          'MIGRATION_REQUIRED',
          'Uptime alerts are not set up on this deployment yet.'
        );
      }
      // Creates the row if this is the account's first preference.
      await getOrCreatePreferences(userId);
      return NextResponse.json(await setUptimeAlerts(userId, body.uptimeAlerts));
    }

    throw new ProjectError(
      400,
      'VALIDATION',
      'Expected weeklyDigest or uptimeAlerts to be true or false.'
    );
  } catch (error) {
    return projectErrorResponse(error);
  }
}
