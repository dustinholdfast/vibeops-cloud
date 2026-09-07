import { NextResponse } from 'next/server';
import { acceptInvite } from '@/src/db/workspace-service';
import { projectErrorResponse } from '@/src/lib/project-errors';
import { currentUserEmails, requireUserId } from '@/src/lib/request-scope';

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const emails = await currentUserEmails();
    return NextResponse.json(await acceptInvite(userId, emails, await req.json()));
  } catch (error) {
    return projectErrorResponse(error);
  }
}
