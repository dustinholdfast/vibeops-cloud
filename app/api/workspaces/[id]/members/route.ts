import { NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { listMembers, type MemberSummary } from '@/src/db/workspace-service';
import { projectErrorResponse } from '@/src/lib/project-errors';
import { requireUserId } from '@/src/lib/request-scope';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Membership is stored as Clerk user ids. Names and addresses live in Clerk, so
 * they are looked up here for display only — a failed lookup degrades to the id
 * rather than failing the request.
 */
async function withIdentities(members: MemberSummary[]) {
  if (members.length === 0) return members;

  try {
    const client = await clerkClient();
    const { data } = await client.users.getUserList({
      userId: members.map((member) => member.userId),
      limit: members.length,
    });
    const byId = new Map(data.map((user) => [user.id, user]));

    return members.map((member) => {
      const user = byId.get(member.userId);
      if (!user) return member;
      const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
      return {
        ...member,
        name: name || undefined,
        email: user.primaryEmailAddress?.emailAddress ?? undefined,
      };
    });
  } catch {
    return members;
  }
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const userId = await requireUserId();
    const { workspace, members } = await listMembers(userId, (await ctx.params).id);
    return NextResponse.json({ workspace, members: await withIdentities(members) });
  } catch (error) {
    return projectErrorResponse(error);
  }
}
