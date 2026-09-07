import { NextResponse } from 'next/server';
import { deleteWorkspace, renameWorkspace, requireMembership } from '@/src/db/workspace-service';
import { projectErrorResponse } from '@/src/lib/project-errors';
import { requireUserId } from '@/src/lib/request-scope';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const userId = await requireUserId();
    return NextResponse.json({
      workspace: await requireMembership(userId, (await ctx.params).id),
    });
  } catch (error) {
    return projectErrorResponse(error);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const userId = await requireUserId();
    return NextResponse.json(
      await renameWorkspace(userId, (await ctx.params).id, await req.json())
    );
  } catch (error) {
    return projectErrorResponse(error);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const userId = await requireUserId();
    return NextResponse.json(await deleteWorkspace(userId, (await ctx.params).id));
  } catch (error) {
    return projectErrorResponse(error);
  }
}
