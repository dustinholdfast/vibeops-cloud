import { NextResponse } from 'next/server';
import { revokeInvite } from '@/src/db/workspace-service';
import { projectErrorResponse } from '@/src/lib/project-errors';
import { requireUserId } from '@/src/lib/request-scope';

type Ctx = { params: Promise<{ id: string; inviteId: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const userId = await requireUserId();
    const { id, inviteId } = await ctx.params;
    return NextResponse.json(await revokeInvite(userId, id, inviteId));
  } catch (error) {
    return projectErrorResponse(error);
  }
}
