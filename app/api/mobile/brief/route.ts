import { NextResponse } from 'next/server';
import { listProjects } from '@/src/db/project-service';
import { projectErrorResponse } from '@/src/lib/project-errors';
import { rankPortfolio } from '@/src/lib/portfolio';
import { requireScope } from '@/src/lib/request-scope';

/** Share the web dashboard's daily recommendation with the mobile client. */
export async function GET(req: Request) {
  try {
    const { projects } = await listProjects(await requireScope(req));
    const top = rankPortfolio(projects)[0];
    return NextResponse.json({
      recommendation: top
        ? { projectId: top.project.id, reasons: top.reasons, deadline: top.deadline }
        : null,
    });
  } catch (error) {
    return projectErrorResponse(error);
  }
}
