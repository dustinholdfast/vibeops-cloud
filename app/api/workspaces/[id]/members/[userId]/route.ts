import { NextResponse } from 'next/server';
import { removeMember, updateMemberRole } from '@/src/db/workspace-service';
import { projectErrorResponse } from '@/src/lib/project-errors';
import { requireUserId } from '@/src/lib/request-scope';

type Ctx = { params: Promise<{ id: string; userId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const actorId = await requireUserId();
    const { id, userId } = await ctx.params;
    return NextResponse.json(await updateMemberRole(actorId, id, userId, await req.json()));
  } catch (error) {
    return projectErrorResponse(error);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const actorId = await requireUserId();
    const { id, userId } = await ctx.params;
    return NextResponse.json(await removeMember(actorId, id, userId));
  } catch (error) {
    return projectErrorResponse(error);
  }
}
