import { auth, currentUser } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { requireMembership } from '../db/workspace-service';
import type { Scope } from '../db/project-service';
import { ProjectError } from './project-validation';

/** The client names the workspace it is acting in; the cookie is the fallback. */
export const WORKSPACE_HEADER = 'x-vibeops-workspace';
export const WORKSPACE_COOKIE = 'vibeops-workspace';

export async function requireUserId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new ProjectError(401, 'UNAUTHORIZED', 'Please sign in again.');
  return userId;
}

/**
 * Which workspace a request is for. Never trusted on its own — it is always
 * checked against membership before anything is read or written.
 */
export async function requestedWorkspaceId(req: Request): Promise<string | null> {
  const header = req.headers.get(WORKSPACE_HEADER);
  if (header) return header;
  const jar = await cookies();
  return jar.get(WORKSPACE_COOKIE)?.value ?? null;
}

/** Resolves the acting user and proves they belong to the workspace they named. */
export async function requireScope(req: Request): Promise<Scope> {
  const userId = await requireUserId();
  const workspace = await requireMembership(userId, await requestedWorkspaceId(req));
  return { userId, workspace };
}

/**
 * Verified email addresses on the signed-in account. An invitation may only be
 * redeemed by someone who actually holds the address it was sent to.
 */
export async function currentUserEmails(): Promise<string[]> {
  const user = await currentUser();
  if (!user) return [];
  return user.emailAddresses
    .filter((address) => address.verification?.status === 'verified')
    .map((address) => address.emailAddress);
}
