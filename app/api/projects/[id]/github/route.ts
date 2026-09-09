import { NextResponse } from 'next/server';
import { getProject } from '@/src/db/project-service';
import { projectErrorResponse } from '@/src/lib/project-errors';
import { requireScope } from '@/src/lib/request-scope';
import { can } from '@/src/lib/workspace-roles';
import { ProjectError } from '@/src/lib/project-validation';
import { githubAccessToken, putGitHubFile, requireGitHubRepo, snapshotPath } from '@/src/lib/github-push';
import { renderProjectSnapshot } from '@/src/lib/github-snapshot';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const scope = await requireScope(req);
    if (!can(scope.workspace.role, 'edit:projects')) {
      throw new ProjectError(403, 'FORBIDDEN', 'You have view-only access to this workspace.');
    }
    const { project } = await getProject(scope, (await ctx.params).id);
    const ref = requireGitHubRepo(project.repoUrl);
    const token = await githubAccessToken(scope.userId);
    const path = snapshotPath(project.id);
    const result = await putGitHubFile({
      token,
      ref,
      path,
      content: renderProjectSnapshot(project),
      message: `vibeops: snapshot ${project.name}`,
    });
    return NextResponse.json({
      ok: true,
      owner: ref.owner,
      repo: ref.repo,
      ...result,
    });
  } catch (error) {
    return projectErrorResponse(error);
  }
}
