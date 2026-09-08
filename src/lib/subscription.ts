import { eq } from 'drizzle-orm';
import { requireDb } from '@/src/db';
import { subscriptions } from '@/src/db/schema';
import { resolvePlan, type PlanId } from '@/src/lib/plans';
import { getStripe } from '@/src/lib/stripe';

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

export type AdminPlanWrite = {
  userId: string;
  plan: PlanId;
  /** When forcing Free on a paid account, cancel the Stripe subscription too. */
  cancelStripe?: boolean;
};

/**
 * Operator override. Pro grants are stored as complimentary so they survive
 * without a Stripe subscription. A later Checkout webhook can still promote
 * the same row to a paid `active` status.
 */
export async function adminSetPlan({
  userId,
  plan,
  cancelStripe = false,
}: AdminPlanWrite) {
  const existing = await ensureSubscriptionRow(userId);
  const now = new Date();

  if (plan === 'pro') {
    const status =
      existing.status === 'active' || existing.status === 'trialing'
        ? existing.status
        : 'complimentary';
    await requireDb()
      .update(subscriptions)
      .set({
        plan: 'pro',
        status,
        updatedAt: now,
      })
      .where(eq(subscriptions.userId, userId));
  } else {
    if (cancelStripe && existing.stripeSubscriptionId && process.env.STRIPE_SECRET_KEY) {
      try {
        await getStripe().subscriptions.cancel(existing.stripeSubscriptionId);
      } catch (error) {
        console.error('[admin] stripe cancel failed', error);
      }
    }
    await requireDb()
      .update(subscriptions)
      .set({
        plan: 'free',
        status: 'free',
        stripeSubscriptionId: cancelStripe ? null : existing.stripeSubscriptionId,
        stripePriceId: cancelStripe ? null : existing.stripePriceId,
        cancelAtPeriodEnd: 0,
        updatedAt: now,
      })
      .where(eq(subscriptions.userId, userId));
  }

  return getUserPlan(userId);
}
