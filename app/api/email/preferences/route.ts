import { NextResponse } from 'next/server';
import { getOrCreatePreferences, setWeeklyDigest } from '@/src/db/digest-service';
import { projectErrorResponse } from '@/src/lib/project-errors';
import { requireUserId } from '@/src/lib/request-scope';
import { ProjectError } from '@/src/lib/project-validation';

export async function GET() {
  try {
    const userId = await requireUserId();
    const prefs = await getOrCreatePreferences(userId);
    return NextResponse.json({ weeklyDigest: prefs.weeklyDigest === 1 });
  } catch (error) {
    return projectErrorResponse(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const userId = await requireUserId();
    const body = (await req.json()) as { weeklyDigest?: unknown };
    if (typeof body.weeklyDigest !== 'boolean') {
      throw new ProjectError(400, 'VALIDATION', 'Expected weeklyDigest to be true or false.');
    }
    return NextResponse.json(await setWeeklyDigest(userId, body.weeklyDigest));
  } catch (error) {
    return projectErrorResponse(error);
  }
}
