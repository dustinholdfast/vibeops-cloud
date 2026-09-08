import { eq, inArray } from 'drizzle-orm';
import { clerkClient } from '@clerk/nextjs/server';
import { requireDb } from '@/src/db';
import {
  emailPreferences,
  projects,
  subscriptions,
  workspaceInvites,
  workspaceMembers,
  workspaces,
} from '@/src/db/schema';
import { getStripe } from '@/src/lib/stripe';
import { ProjectError } from '@/src/lib/project-validation';

export async function adminDeleteUser(actorUserId: string, targetUserId: string) {
  if (!targetUserId) throw new ProjectError(400, 'VALIDATION', 'userId is required.');
  if (actorUserId === targetUserId) {
    throw new ProjectError(400, 'VALIDATION', 'You cannot delete your own admin account.');
  }

  const db = requireDb();
  const owned = await db.select().from(workspaces).where(eq(workspaces.ownerUserId, targetUserId));
  const ownedIds = owned.map((workspace) => workspace.id);
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, targetUserId)).limit(1);

  if (sub?.stripeSubscriptionId && process.env.STRIPE_SECRET_KEY) {
    try {
      await getStripe().subscriptions.cancel(sub.stripeSubscriptionId);
    } catch (error) {
      console.error('[admin] stripe cancel on delete failed', error);
    }
  }

  await db.transaction(async (tx) => {
    if (ownedIds.length > 0) {
      await tx.delete(projects).where(inArray(projects.workspaceId, ownedIds));
      await tx.delete(workspaceInvites).where(inArray(workspaceInvites.workspaceId, ownedIds));
      await tx.delete(workspaceMembers).where(inArray(workspaceMembers.workspaceId, ownedIds));
      await tx.delete(workspaces).where(inArray(workspaces.id, ownedIds));
    }
    await tx.delete(workspaceMembers).where(eq(workspaceMembers.userId, targetUserId));
    await tx.delete(workspaceInvites).where(eq(workspaceInvites.invitedByUserId, targetUserId));
    await tx.delete(emailPreferences).where(eq(emailPreferences.userId, targetUserId));
    await tx.delete(subscriptions).where(eq(subscriptions.userId, targetUserId));
    await tx.delete(projects).where(eq(projects.userId, targetUserId));
  });

  try {
    const client = await clerkClient();
    await client.users.deleteUser(targetUserId);
  } catch (error) {
    console.error('[admin] clerk deleteUser failed', error);
    throw new ProjectError(
      502,
      'UPSTREAM',
      'Cloud data was removed, but Clerk still has this user. Delete them in the Clerk dashboard or retry.'
    );
  }

  return {
    ok: true as const,
    userId: targetUserId,
    deletedWorkspaces: ownedIds.length,
  };
}
