import { NextResponse } from 'next/server';
import { clerkFrontendApi, clerkKeyKind } from '@/src/lib/clerk-frontend';
import { socialStrategiesFromEnvironment } from '@/src/lib/clerk-social';

export const dynamic = 'force-dynamic';

export async function GET() {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) {
    return NextResponse.json(
      { error: 'Clerk publishable key is not configured on this deployment.' },
      { status: 503 }
    );
  }

  const frontendApi = clerkFrontendApi(publishableKey);
  const keyKind = clerkKeyKind(publishableKey);
  if (!frontendApi) {
    return NextResponse.json(
      { error: 'Could not decode the Clerk Frontend API from the publishable key.', keyKind },
      { status: 500 }
    );
  }

  const response = await fetch(`https://${frontendApi}/v1/environment`, { cache: 'no-store' });
  if (!response.ok) {
    return NextResponse.json(
      {
        error: `Clerk environment lookup failed (${response.status}).`,
        frontendApi,
        keyKind,
      },
      { status: 502 }
    );
  }

  const environment = await response.json();
  const { strategies, githubStrategy } = socialStrategiesFromEnvironment(environment);

  return NextResponse.json({
    frontendApi,
    keyKind,
    strategies,
    githubStrategy,
  });
}
