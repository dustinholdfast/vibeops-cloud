import { and, desc, eq, inArray, lt, or, isNull, sql } from 'drizzle-orm';
import { requireDb } from './index';
import { emailPreferences, projects, workspaceMembers, workspaces } from './schema';
import { dbProjectToDomain } from './map';
import { buildPortfolioReview, REVIEW_WINDOW_DAYS } from '../lib/review';
import type { WorkspaceDigest } from '../lib/email/render-digest';
import { isWorkspaceRole } from '../lib/workspace-roles';

/**
 * Assembles weekly digests. Everything here is read-mostly and isolated from the
 * project request path, so a missing `email_preferences` table disables the
 * digest rather than affecting the application.
 */

/** A digest is at most weekly; this guards a retried or overlapping cron run. */
const MIN_HOURS_BETWEEN_SENDS = 6 * 24;

export type DigestCandidate = {
  userId: string;
  workspaces: WorkspaceDigest[];
};

function newToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Reads a user's preferences, creating the row on first use. An account with no
 * row is subscribed by default — these are people who signed up for the
 * product — and every message carries a one-click unsubscribe.
 */
export async function getOrCreatePreferences(userId: string) {
  const db = requireDb();
  const now = new Date();

  await db
    .insert(emailPreferences)
    .values({
      userId,
      weeklyDigest: 1,
      unsubscribeToken: newToken(),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  const [row] = await db
    .select()
    .from(emailPreferences)
    .where(eq(emailPreferences.userId, userId));
  return row;
}

export async function setWeeklyDigest(userId: string, enabled: boolean) {
  await getOrCreatePreferences(userId);
  await requireDb()
    .update(emailPreferences)
    .set({ weeklyDigest: enabled ? 1 : 0, updatedAt: new Date() })
    .where(eq(emailPreferences.userId, userId));
  return { weeklyDigest: enabled };
}

/** Unsubscribe by token, so a link in an email works without signing in. */
export async function unsubscribeByToken(token: string): Promise<boolean> {
  if (!/^[a-f0-9]{48}$/.test(token)) return false;
  const rows = await requireDb()
    .update(emailPreferences)
    .set({ weeklyDigest: 0, updatedAt: new Date() })
    .where(eq(emailPreferences.unsubscribeToken, token))
    .returning({ userId: emailPreferences.userId });
  return rows.length > 0;
}

/**
 * Everyone who could receive a digest right now: they belong to at least one
 * workspace, have not unsubscribed, and were not sent one in the last few days.
 *
 * A user with no preferences row has never been considered before, so they are
 * included — the row is created when the send is recorded.
 */
export async function findDigestRecipients(now: Date = new Date()): Promise<string[]> {
  const cutoff = new Date(now.getTime() - MIN_HOURS_BETWEEN_SENDS * 60 * 60 * 1000);

  const rows = await requireDb()
    .selectDistinct({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .leftJoin(emailPreferences, eq(emailPreferences.userId, workspaceMembers.userId))
    .where(
      and(
        or(isNull(emailPreferences.weeklyDigest), eq(emailPreferences.weeklyDigest, 1)),
        or(isNull(emailPreferences.lastSentAt), lt(emailPreferences.lastSentAt, cutoff))
      )
    );

  return rows.map((row) => row.userId);
}

/**
 * Builds one review per workspace the user belongs to, so somebody in three
 * workspaces gets one email with three sections rather than three emails.
 * Workspaces with no active projects are dropped.
 */
export async function buildDigestFor(
  userId: string,
  now: Date = new Date(),
  windowDays: number = REVIEW_WINDOW_DAYS
): Promise<DigestCandidate> {
  const db = requireDb();

  const memberships = await db
    .select({
      workspaceId: workspaces.id,
      name: workspaces.name,
      personal: workspaces.personal,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId));

  if (memberships.length === 0) return { userId, workspaces: [] };

  const rows = await db
    .select()
    .from(projects)
    .where(
      inArray(
        projects.workspaceId,
        memberships.map((m) => m.workspaceId)
      )
    )
    .orderBy(desc(projects.lastTouched));

  const byWorkspace = new Map<string, ReturnType<typeof dbProjectToDomain>[]>();
  for (const row of rows) {
    const list = byWorkspace.get(row.workspaceId) ?? [];
    list.push(dbProjectToDomain(row));
    byWorkspace.set(row.workspaceId, list);
  }

  const digests: WorkspaceDigest[] = [];
  for (const membership of memberships) {
    // A role that is not recognised is treated as read-only, never dropped.
    if (!isWorkspaceRole(membership.role)) continue;
    const list = byWorkspace.get(membership.workspaceId) ?? [];
    if (list.length === 0) continue;

    digests.push({
      workspaceId: membership.workspaceId,
      name: membership.name,
      personal: membership.personal === 1,
      review: buildPortfolioReview(list, now, windowDays),
    });
  }

  // Personal first, then by name, matching the order in the switcher.
  digests.sort(
    (a, b) => Number(b.personal) - Number(a.personal) || a.name.localeCompare(b.name)
  );

  return { userId, workspaces: digests };
}

/** Records a successful send so the next run skips this user. */
export async function recordDigestSent(userId: string, now: Date = new Date()) {
  await getOrCreatePreferences(userId);
  await requireDb()
    .update(emailPreferences)
    .set({ lastSentAt: now, updatedAt: now })
    .where(eq(emailPreferences.userId, userId));
}

/** True when the digest tables are present; lets the cron report a clear reason. */
export async function digestStorageReady(): Promise<boolean> {
  try {
    await requireDb().execute(sql`select 1 from email_preferences limit 1`);
    return true;
  } catch {
    return false;
  }
}
