import { NextResponse } from 'next/server';
import { createWorkspace, listWorkspaces } from '@/src/db/workspace-service';
import { projectErrorResponse } from '@/src/lib/project-errors';
import { requireUserId } from '@/src/lib/request-scope';

export async function GET() {
  try {
    const userId = await requireUserId();
    return NextResponse.json({ workspaces: await listWorkspaces(userId) });
  } catch (error) {
    return projectErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    return NextResponse.json(await createWorkspace(userId, await req.json()), { status: 201 });
  } catch (error) {
    return projectErrorResponse(error);
  }
}
