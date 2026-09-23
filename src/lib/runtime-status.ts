import { env } from './env';

export type RuntimeStatus = {
  service: 'noxen';
  phase: number;
  environment: 'production' | 'staging';
  productionReady: boolean;
  productionBlockers: string[];
  hasDatabase: boolean;
  hasHyperdrive: boolean;
  hasClerk: boolean;
  hasStripe: boolean;
  stripeMode: 'live' | 'test' | 'mixed' | 'missing';
  hasCronSecret: boolean;
};

function hostname(appUrl: string | undefined): string | null {
  if (!appUrl) return null;
  try {
    return new URL(appUrl).hostname;
  } catch {
    return null;
  }
}

function isPlatformHost(host: string | null): boolean {
  if (!host) return true;
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.workers.dev') ||
    host.endsWith('.vercel.app')
  );
}

/**
 * Capability flags for /api/health. Phase is derived from what is actually
 * configured, not a hardcoded number that drifts from the README.
 *
 * Production Clerk cannot run on workers.dev — swapping pk_live_ here would
 * orphan every workspace id. noxencloud.com is the custom domain; live keys
 * stay a separate blocker until the identity mapping is applied.
 */
export function runtimeStatus(opts: { hasHyperdrive: boolean }): RuntimeStatus {
  const publishable = env('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY') ?? '';
  const hasDatabase = Boolean(env('DATABASE_URL'));
  const hasClerk = Boolean(publishable && env('CLERK_SECRET_KEY'));
  const stripeSecret = env('STRIPE_SECRET_KEY') ?? '';
  const stripePublishable = env('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY') ?? '';
  const hasStripe = Boolean(stripeSecret && stripePublishable);
  const stripeMode = stripeKeyMode(stripeSecret, stripePublishable);
  const hasCronSecret = Boolean(env('CRON_SECRET'));
  const host = hostname(env('NEXT_PUBLIC_APP_URL'));
  const liveKeys = publishable.startsWith('pk_live_');
  const customDomain = !isPlatformHost(host);
  const productionReady = liveKeys && customDomain;
  const productionBlockers: string[] = [];
  if (!customDomain) {
    productionBlockers.push('Custom domain — Clerk production refuses workers.dev');
  }
  if (!liveKeys) {
    productionBlockers.push('Clerk production keys (pk_live_ / sk_live_)');
  }

  let phase = 1;
  if (hasDatabase && hasClerk) phase = 3;
  if (phase >= 3 && hasStripe) phase = 4;
  if (phase >= 4 && hasCronSecret) phase = 5;

  return {
    service: 'noxen',
    phase,
    environment: productionReady ? 'production' : 'staging',
    productionReady,
    productionBlockers,
    hasDatabase,
    hasHyperdrive: opts.hasHyperdrive,
    hasClerk,
    hasStripe,
    stripeMode,
    hasCronSecret,
  };
}

function stripeKeyMode(
  secret: string,
  publishable: string
): RuntimeStatus['stripeMode'] {
  const secretLive = secret.startsWith('sk_live_');
  const secretTest = secret.startsWith('sk_test_');
  const publishableLive = publishable.startsWith('pk_live_');
  const publishableTest = publishable.startsWith('pk_test_');
  if (!secret && !publishable) return 'missing';
  if ((secretLive && publishableTest) || (secretTest && publishableLive)) return 'mixed';
  if (secretLive || publishableLive) return 'live';
  if (secretTest || publishableTest) return 'test';
  return 'missing';
}
