import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireDb } from '@/src/db';
import { subscriptions } from '@/src/db/schema';
import { getStripe, getAppUrl, getProPriceId } from '@/src/lib/stripe';
import { ensureSubscriptionRow } from '@/src/lib/subscription';

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const interval: 'month' | 'year' =
      body.interval === 'year' ? 'year' : 'month';

    const stripe = getStripe();
    const appUrl = getAppUrl();
    const priceId = getProPriceId(interval);

    const row = await ensureSubscriptionRow(userId);
    let customerId = row.stripeCustomerId;

    if (!customerId) {
      const user = await currentUser();
      const email =
        user?.primaryEmailAddress?.emailAddress ||
        user?.emailAddresses?.[0]?.emailAddress;

      const customer = await stripe.customers.create({
        email: email || undefined,
        metadata: { clerkUserId: userId },
      });
      customerId = customer.id;

      const db = requireDb();
      await db
        .update(subscriptions)
        .set({ stripeCustomerId: customerId, updatedAt: new Date() })
        .where(eq(subscriptions.userId, userId));
    }

    const session = await stripe.checkout.sessions.create({
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

    return NextResponse.json({ url: session.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Checkout failed';
    console.error('[billing/checkout]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
