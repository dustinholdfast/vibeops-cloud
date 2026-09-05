import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { listProjects, createProject, importProjects } from '@/src/db/project-service';
import { projectErrorResponse } from '@/src/lib/project-errors';


export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Please sign in again.', code: 'UNAUTHORIZED' }, { status: 401 });
    return NextResponse.json(await listProjects(userId));
  } catch (error) { return projectErrorResponse(error); }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Please sign in again.', code: 'UNAUTHORIZED' }, { status: 401 });
    return NextResponse.json(await createProject(userId, await req.json()), { status: 201 });
  } catch (error) { return projectErrorResponse(error); }
}

export async function PUT(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Please sign in again.', code: 'UNAUTHORIZED' }, { status: 401 });
    return NextResponse.json(await importProjects(userId, await req.json()));
  } catch (error) { return projectErrorResponse(error); }
}
