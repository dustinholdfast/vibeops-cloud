import { env } from './env';

/**
 * Custom domain attached in wrangler.jsonc (`routes`). workers.dev stays up
 * as rollback and must not be the origin we put in email or auth links.
 */
export const CANONICAL_PUBLIC_ORIGIN = 'https://noxencloud.com';

/**
 * Absolute origin for links we send or redirect people through: password
 * reset, workspace invites, digest and uptime mail, Stripe return URLs.
 *
 * Next replaces a static `process.env.NEXT_PUBLIC_APP_URL` read with whatever
 * was present at build time. Production bundles were built with the
 * workers.dev staging host, so that read kept winning over the Worker secret
 * and over a request that actually arrived on noxencloud.com. `env()` indexes
 * `process.env` dynamically, so the runtime value is what counts.
 *
 * Order:
 * 1. `APP_URL` — wrangler var (see wrangler.jsonc). An explicit runtime
 *    override, honored even when it is workers.dev so a staging Worker can
 *    opt out. Set with `npx wrangler secret put APP_URL` only to replace it.
 * 2. `NEXT_PUBLIC_APP_URL` when it is a real public origin, not a platform
 *    host (workers.dev, vercel.app, localhost) and not the CI placeholder
 *    `example.invalid`.
 * 3. The inbound request origin, when that is a real public origin.
 * 4. A localhost request or localhost `NEXT_PUBLIC_APP_URL`, so local dev
 *    keeps local links.
 * 5. `VERCEL_URL`, for a Vercel deploy that has no public app URL.
 * 6. `https://noxencloud.com` when the only candidates are platform hosts.
 *    This is the production case: admin reset clicked on workers.dev, or
 *    `NEXT_PUBLIC_APP_URL` still set to that host.
 * 7. `http://localhost:3001` when nothing is configured.
 */
export function publicAppOrigin(requestUrl?: string | null): string {
  const explicit = originOf(env('APP_URL'));
  if (explicit) return canonicalise(explicit);

  const configured = originOf(env('NEXT_PUBLIC_APP_URL'));
  const requestOrigin = originOf(requestUrl);
  const vercel = vercelOrigin();

  if (configured && isCustomPublic(configured)) return canonicalise(configured);
  if (requestOrigin && isCustomPublic(requestOrigin)) return canonicalise(requestOrigin);
  if (requestOrigin && isLocalOrigin(requestOrigin)) return requestOrigin;
  if (configured && isLocalOrigin(configured)) return configured;
  if (vercel) return vercel;

  if (
    (configured && isNonLocalPlatform(configured)) ||
    (requestOrigin && isNonLocalPlatform(requestOrigin))
  ) {
    return CANONICAL_PUBLIC_ORIGIN;
  }

  return 'http://localhost:3001';
}

function originOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

function vercelOrigin(): string | null {
  const host = env('VERCEL_URL');
  if (!host) return null;
  return originOf(host.includes('://') ? host : `https://${host}`);
}

function hostnameOf(origin: string): string {
  return new URL(origin).hostname.toLowerCase();
}

function isLocalHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

function isLocalOrigin(origin: string): boolean {
  return isLocalHost(hostnameOf(origin));
}

/** Hosts that are not the public app: platform defaults and the CI placeholder. */
function isNonLocalPlatform(origin: string): boolean {
  const host = hostnameOf(origin);
  return (
    host.endsWith('.workers.dev') ||
    host.endsWith('.vercel.app') ||
    host === 'example.invalid'
  );
}

function isCustomPublic(origin: string): boolean {
  return !isLocalOrigin(origin) && !isNonLocalPlatform(origin);
}

function canonicalise(origin: string): string {
  if (hostnameOf(origin) === 'www.noxencloud.com') return CANONICAL_PUBLIC_ORIGIN;
  return origin;
}
