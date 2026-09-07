import { NextResponse } from 'next/server';
import { createInvite, listInvites } from '@/src/db/workspace-service';
import { projectErrorResponse } from '@/src/lib/project-errors';
import { requireUserId } from '@/src/lib/request-scope';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const userId = await requireUserId();
    return NextResponse.json(await listInvites(userId, (await ctx.params).id));
  } catch (error) {
    return projectErrorResponse(error);
  }
}

/**
 * Returns the invitation link once. The token is only stored hashed, so it
 * cannot be shown again — the caller must deliver it now.
 */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const userId = await requireUserId();
    const { invite, token } = await createInvite(userId, (await ctx.params).id, await req.json());
    const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
    return NextResponse.json(
      { invite, inviteUrl: `${base}/invite/${token}` },
      { status: 201 }
    );
  } catch (error) {
    return projectErrorResponse(error);
  }
}
