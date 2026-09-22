import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireDb } from '@/src/db';
import { projects } from '@/src/db/schema';
import { getUserPlan } from '@/src/lib/subscription';
import { PLANS, projectLimitFor } from '@/src/lib/plans';
import { requireScope } from '@/src/lib/request-scope';
import { projectErrorResponse } from '@/src/lib/project-errors';

/**
 * Plan and usage for the workspace being viewed. A workspace bills on its
 * owner's subscription, so a member of someone else's Pro workspace sees that
 * workspace's limits — and `manageable` tells the UI whether this viewer is the
 * one who can actually change them.
 */
export async function GET(req: Request) {
  try {
    const { userId, workspace } = await requireScope(req);

    const billing = await getUserPlan(workspace.ownerUserId);
    const viewer = userId === workspace.ownerUserId ? billing : await getUserPlan(userId);
    const rows = await requireDb()
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.workspaceId, workspace.workspaceId));

    return NextResponse.json({
      ...billing,
      planMeta: PLANS[billing.plan],
      projectCount: rows.length,
      projectLimit: projectLimitFor(billing.plan),
      workspace: {
        id: workspace.workspaceId,
        name: workspace.name,
        personal: workspace.personal,
        role: workspace.role,
      },
      manageable: workspace.ownerUserId === userId,
      /** The signed-in account's own plan. Creating a workspace bills the creator, not the workspace they are viewing. */
      viewerPlan: viewer.plan,
    });
  } catch (error) {
    return projectErrorResponse(error);
  }
}
