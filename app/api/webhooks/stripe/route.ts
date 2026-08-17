import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { requireDb } from '@/src/db';
import { subscriptions } from '@/src/db/schema';
import { getStripe } from '@/src/lib/stripe';

export const runtime = 'nodejs';

async function upsertFromSubscription(
  sub: Stripe.Subscription,
  clerkUserId?: string | null
) {
  const db = requireDb();
  const customerId =
    typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const priceId = sub.items.data[0]?.price?.id ?? null;
  const userId =
    clerkUserId ||
    sub.metadata?.clerkUserId ||
    (await findUserIdByCustomer(customerId));

  if (!userId) {
    console.warn('[stripe webhook] no clerk user for sub', sub.id);
    return;
  }

  const isActive = sub.status === 'active' || sub.status === 'trialing';
  const now = new Date();

  await db
    .insert(subscriptions)
    .values({
      userId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: sub.id,
      stripePriceId: priceId,
      plan: isActive ? 'pro' : 'free',
      status: sub.status,
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
      cancelAtPeriodEnd: sub.cancel_at_period_end ? 1 : 0,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: {
        stripeCustomerId: customerId,
        stripeSubscriptionId: sub.id,
        stripePriceId: priceId,
        plan: isActive ? 'pro' : 'free',
        status: sub.status,
        currentPeriodEnd: new Date(sub.current_period_end * 1000),
        cancelAtPeriodEnd: sub.cancel_at_period_end ? 1 : 0,
        updatedAt: now,
      },
    });
}

async function findUserIdByCustomer(customerId: string) {
  const db = requireDb();
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeCustomerId, customerId))
    .limit(1);
  return row?.userId ?? null;
}

async function markFree(userId: string) {
  const db = requireDb();
  await db
    .update(subscriptions)
    .set({
      plan: 'free',
      status: 'canceled',
      stripeSubscriptionId: null,
      stripePriceId: null,
      cancelAtPeriodEnd: 0,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.userId, userId));
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'STRIPE_WEBHOOK_SECRET not configured' },
      { status: 500 }
    );
  }

  const stripe = getStripe();
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Invalid signature';
    console.error('[stripe webhook] signature', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === 'subscription' && session.subscription) {
          const subId =
            typeof session.subscription === 'string'
              ? session.subscription
              : session.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          const clerkUserId =
            session.metadata?.clerkUserId ||
            session.client_reference_id ||
            sub.metadata?.clerkUserId;
          await upsertFromSubscription(sub, clerkUserId);
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const sub = event.data.object as Stripe.Subscription;
        await upsertFromSubscription(sub);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
        const userId =
          sub.metadata?.clerkUserId || (await findUserIdByCustomer(customerId));
        if (userId) await markFree(userId);
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error('[stripe webhook] handler', e);
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
