import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { requireDb } from '@/src/db';
import { subscriptions } from '@/src/db/schema';
import { env } from '@/src/lib/env';
import {
  getStripe,
  getAppUrl,
  getProPriceId,
  isMissingStripeCustomer,
  isMissingStripePrice,
  stripeKeyMode,
} from '@/src/lib/stripe';
import { ensureSubscriptionRow } from '@/src/lib/subscription';
import { isRecord } from '@/src/lib/validation';

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const parsed: unknown = await req.json().catch(() => ({}));
    const body = isRecord(parsed) ? parsed : {};
    const interval: 'month' | 'year' =
      body.interval === 'year' ? 'year' : 'month';

    const stripe = getStripe();
    const appUrl = getAppUrl();
    const priceId = getProPriceId(interval);

    await ensureSubscriptionRow(userId);
    let customerId = await customerForCheckout(stripe, userId);

    let session;
    try {
      session = await openCheckout(stripe, customerId, priceId, appUrl, userId);
    } catch (error) {
      if (!isMissingStripeCustomer(error)) throw error;
      customerId = await customerForCheckout(stripe, userId, { replace: true });
      session = await openCheckout(stripe, customerId, priceId, appUrl, userId);
    }

    return NextResponse.json({ url: session.url });
  } catch (e) {
    const message = isMissingStripePrice(e)
      ? `That Price ID is not in this Stripe account. Copy the monthly and yearly price_ IDs again with the dashboard in ${stripeKeyMode(env('STRIPE_SECRET_KEY'))} mode.`
      : e instanceof Error
        ? e.message
        : 'Checkout failed';
    console.error('[billing/checkout]', e instanceof Error ? e.message : message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function customerForCheckout(
  stripe: Stripe,
  userId: string,
  opts?: { replace?: boolean }
): Promise<string> {
  if (!opts?.replace) {
    const row = await ensureSubscriptionRow(userId);
    if (row.stripeCustomerId) return row.stripeCustomerId;
  }

  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ||
    user?.emailAddresses?.[0]?.emailAddress;
  const customer = await stripe.customers.create({
    email: email || undefined,
    metadata: { clerkUserId: userId },
  });

  await requireDb()
    .update(subscriptions)
    .set({
      stripeCustomerId: customer.id,
      ...(opts?.replace ? { stripeSubscriptionId: null, stripePriceId: null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.userId, userId));

  return customer.id;
}

function openCheckout(
  stripe: Stripe,
  customerId: string,
  priceId: string,
  appUrl: string,
  userId: string
) {
  return stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/dashboard?billing=success`,
    cancel_url: `${appUrl}/pricing?billing=canceled`,
    client_reference_id: userId,
    metadata: { clerkUserId: userId },
    subscription_data: {
      metadata: { clerkUserId: userId },
    },
    allow_promotion_codes: true,
  });
}
