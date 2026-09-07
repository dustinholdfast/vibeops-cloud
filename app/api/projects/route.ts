import { NextResponse } from 'next/server';
import { listProjects, createProject, importProjects } from '@/src/db/project-service';
import { projectErrorResponse } from '@/src/lib/project-errors';
import { requireScope } from '@/src/lib/request-scope';

export async function GET(req: Request) {
  try {
    return NextResponse.json(await listProjects(await requireScope(req)));
  } catch (error) {
    return projectErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const scope = await requireScope(req);
    return NextResponse.json(await createProject(scope, await req.json()), { status: 201 });
  } catch (error) {
    return projectErrorResponse(error);
  }
}

export async function PUT(req: Request) {
  try {
    const scope = await requireScope(req);
    return NextResponse.json(await importProjects(scope, await req.json()));
  } catch (error) {
    return projectErrorResponse(error);
  }
}
