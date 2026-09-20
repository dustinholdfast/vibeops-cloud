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
 * orphan every workspace id. That stays a blocker until a custom domain exists.
 */
export function runtimeStatus(opts: { hasHyperdrive: boolean }): RuntimeStatus {
  const publishable = env('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY') ?? '';
  const hasDatabase = Boolean(env('DATABASE_URL'));
  const hasClerk = Boolean(publishable && env('CLERK_SECRET_KEY'));
  const hasStripe = Boolean(env('STRIPE_SECRET_KEY') && env('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'));
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
    hasCronSecret,
  };
}
