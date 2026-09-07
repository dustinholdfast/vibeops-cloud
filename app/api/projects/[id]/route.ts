import { NextResponse } from 'next/server';
import { getProject, updateProject, deleteProject } from '@/src/db/project-service';
import { projectErrorResponse } from '@/src/lib/project-errors';
import { requireScope } from '@/src/lib/request-scope';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const scope = await requireScope(req);
    return NextResponse.json(await getProject(scope, (await ctx.params).id));
  } catch (error) {
    return projectErrorResponse(error);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const scope = await requireScope(req);
    return NextResponse.json(await updateProject(scope, (await ctx.params).id, await req.json()));
  } catch (error) {
    return projectErrorResponse(error);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const scope = await requireScope(req);
    return NextResponse.json(await deleteProject(scope, (await ctx.params).id, await req.json()));
  } catch (error) {
    return projectErrorResponse(error);
  }
}
