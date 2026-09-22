import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getStripe, getAppUrl, isMissingStripeCustomer } from '@/src/lib/stripe';
import { getSubscriptionRow } from '@/src/lib/subscription';

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const row = await getSubscriptionRow(userId);
    if (!row?.stripeCustomerId) {
      return NextResponse.json(
        { error: 'No billing account yet. Subscribe first.' },
        { status: 400 }
      );
    }

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: row.stripeCustomerId,
      return_url: `${getAppUrl()}/dashboard`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    if (isMissingStripeCustomer(e)) {
      return NextResponse.json(
        { error: 'That billing account is not in this Stripe account. Upgrade again to create a new one.' },
        { status: 409 }
      );
    }
    const message = e instanceof Error ? e.message : 'Portal failed';
    console.error('[billing/portal]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
