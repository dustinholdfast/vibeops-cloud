import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getProject, updateProject, deleteProject } from '@/src/db/project-service';
import { projectErrorResponse } from '@/src/lib/project-errors';
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Please sign in again.', code: 'UNAUTHORIZED' }, { status: 401 });
    return NextResponse.json(await getProject(userId, (await ctx.params).id));
  } catch (error) { return projectErrorResponse(error); }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Please sign in again.', code: 'UNAUTHORIZED' }, { status: 401 });
    return NextResponse.json(await updateProject(userId, (await ctx.params).id, await req.json()));
  } catch (error) { return projectErrorResponse(error); }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Please sign in again.', code: 'UNAUTHORIZED' }, { status: 401 });
    return NextResponse.json(await deleteProject(userId, (await ctx.params).id, await req.json()));
  } catch (error) { return projectErrorResponse(error); }
}
