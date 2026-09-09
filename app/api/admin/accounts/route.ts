import { NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { count } from 'drizzle-orm';
import { requireAdmin } from '@/src/lib/admin';
import { adminDeleteUser } from '@/src/lib/admin-delete-user';
import { requireDb } from '@/src/db';
import {
  projects,
  subscriptions,
  workspaceMembers,
  workspaces,
} from '@/src/db/schema';
import { adminSetPlan } from '@/src/lib/subscription';
import { projectLimitFor, resolvePlan, type PlanId } from '@/src/lib/plans';
import { projectErrorResponse } from '@/src/lib/project-errors';
import { ProjectError } from '@/src/lib/project-validation';

async function clerkDirectory(userIds: string[]) {
  const map = new Map<string, { email: string | null; name: string | null }>();
  if (userIds.length === 0) return map;
  try {
    const client = await clerkClient();
    const unique = [...new Set(userIds)].slice(0, 200);
    const list = await client.users.getUserList({
      userId: unique,
      limit: unique.length,
    });
    for (const user of list.data) {
      const email =
        user.primaryEmailAddress?.emailAddress ??
        user.emailAddresses[0]?.emailAddress ??
        null;
      const name =
        [user.firstName, user.lastName].filter(Boolean).join(' ') ||
        user.username ||
        null;
      map.set(user.id, { email, name });
    }
  } catch (error) {
    console.warn('[admin] clerk directory unavailable', error);
  }
  return map;
}

export async function GET() {
  try {
    await requireAdmin();
    const db = requireDb();

    const [memberRows, workspaceRows, subRows, projectCounts] = await Promise.all([
      db.select().from(workspaceMembers),
      db.select().from(workspaces),
      db.select().from(subscriptions),
      db
        .select({ workspaceId: projects.workspaceId, n: count() })
        .from(projects)
        .groupBy(projects.workspaceId),
    ]);

    const projectByWorkspace = new Map(projectCounts.map((row) => [row.workspaceId, Number(row.n)]));
    const subByUser = new Map(subRows.map((row) => [row.userId, row]));

    const userIds = new Set<string>();
    for (const row of memberRows) userIds.add(row.userId);
    for (const row of workspaceRows) userIds.add(row.ownerUserId);
    for (const row of subRows) userIds.add(row.userId);

    const directory = await clerkDirectory([...userIds]);

    const accounts = [...userIds].map((userId) => {
      const owned = workspaceRows.filter((workspace) => workspace.ownerUserId === userId);
      const memberOf = memberRows.filter((row) => row.userId === userId);
      const sub = subByUser.get(userId);
      const plan = resolvePlan(sub?.plan, sub?.status);
      const projectCount = owned.reduce(
        (sum, workspace) => sum + (projectByWorkspace.get(workspace.id) ?? 0),
        0
      );
      const profile = directory.get(userId);
      return {
        userId,
        email: profile?.email ?? null,
        name: profile?.name ?? null,
        plan,
        status: sub?.status ?? 'free',
        stripeCustomerId: sub?.stripeCustomerId ?? null,
        stripeSubscriptionId: sub?.stripeSubscriptionId ?? null,
        currentPeriodEnd: sub?.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
        ownedWorkspaces: owned.map((workspace) => ({
          id: workspace.id,
          name: workspace.name,
          personal: Boolean(workspace.personal),
          projects: projectByWorkspace.get(workspace.id) ?? 0,
        })),
        memberships: memberOf.length,
        projectCount,
        projectLimit: projectLimitFor(plan),
      };
    });

    accounts.sort((a, b) => {
      const left = (a.email ?? a.userId).toLowerCase();
      const right = (b.email ?? b.userId).toLowerCase();
      return left.localeCompare(right);
    });

    return NextResponse.json({ accounts, total: accounts.length });
  } catch (error) {
    return projectErrorResponse(error);
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAdmin();
    const body = (await req.json()) as {
      userId?: string;
      plan?: string;
      cancelStripe?: boolean;
    };
    const userId = body.userId?.trim();
    const plan = body.plan as PlanId;
    if (!userId) throw new ProjectError(400, 'VALIDATION', 'userId is required.');
    if (plan !== 'free' && plan !== 'pro') {
      throw new ProjectError(400, 'VALIDATION', 'plan must be free or pro.');
    }
    const billing = await adminSetPlan({
      userId,
      plan,
      cancelStripe: Boolean(body.cancelStripe),
    });
    return NextResponse.json({ ok: true, userId, ...billing });
  } catch (error) {
    return projectErrorResponse(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const { userId: actorUserId } = await requireAdmin();
    const body = (await req.json()) as { userId?: string };
    const userId = body.userId?.trim();
    if (!userId) throw new ProjectError(400, 'VALIDATION', 'userId is required.');
    return NextResponse.json(await adminDeleteUser(actorUserId, userId));
  } catch (error) {
    return projectErrorResponse(error);
  }
}
