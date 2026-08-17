import { eq } from 'drizzle-orm';
import { requireDb } from '@/src/db';
import { subscriptions, projects } from '@/src/db/schema';
import {
  resolvePlan,
  canCreateProject,
  type PlanId,
} from '@/src/lib/plans';

export async function getSubscriptionRow(userId: string) {
  const db = requireDb();
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  return row ?? null;
}

export async function getUserPlan(userId: string): Promise<{
  plan: PlanId;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
}> {
  const row = await getSubscriptionRow(userId);
  const plan = resolvePlan(row?.plan, row?.status);
  return {
    plan,
    status: row?.status ?? 'free',
    currentPeriodEnd: row?.currentPeriodEnd
      ? row.currentPeriodEnd.toISOString()
      : null,
    cancelAtPeriodEnd: Boolean(row?.cancelAtPeriodEnd),
    stripeCustomerId: row?.stripeCustomerId ?? null,
  };
}

export async function ensureSubscriptionRow(userId: string) {
  const existing = await getSubscriptionRow(userId);
  if (existing) return existing;
  const db = requireDb();
  const now = new Date();
  const [row] = await db
    .insert(subscriptions)
    .values({
      userId,
      plan: 'free',
      status: 'free',
      cancelAtPeriodEnd: 0,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning();
  return row ?? (await getSubscriptionRow(userId))!;
}

export async function assertCanCreateProject(userId: string) {
  const { plan } = await getUserPlan(userId);
  const db = requireDb();
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.userId, userId));
  const check = canCreateProject(plan, rows.length);
  if (!check.ok) {
    return {
      allowed: false as const,
      plan,
      limit: check.limit,
      count: rows.length,
    };
  }
  return { allowed: true as const, plan, count: rows.length };
}
