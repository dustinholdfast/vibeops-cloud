/**
 * Paths Clerk middleware must leave alone. Keep this list in lockstep with
 * `createRouteMatcher` in middleware.ts — marketing URLs that 404/redirect to
 * sign-in look like a broken deploy.
 */
export const PUBLIC_ROUTE_MATCHERS = [
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/sso-callback(.*)',
  '/pricing',
  '/privacy',
  '/terms',
  '/robots.txt',
  '/sitemap.xml',
  '/reset-password(.*)',
  '/api/health',
  '/api/auth/social',
  '/api/auth/reset-password',
  '/api/webhooks/stripe(.*)',
  '/api/cron/(.*)',
  '/api/email/unsubscribe',
] as const;

export function isPublicPathname(pathname: string): boolean {
  const path = pathname.split('?')[0] || '/';
  if (
    path === '/' ||
    path === '/pricing' ||
    path === '/privacy' ||
    path === '/terms' ||
    path === '/robots.txt' ||
    path === '/sitemap.xml' ||
    path === '/api/health' ||
    path === '/api/auth/social' ||
    path === '/api/auth/reset-password' ||
    path === '/api/email/unsubscribe'
  ) {
    return true;
  }
  if (path.startsWith('/sign-in') || path.startsWith('/sign-up') || path.startsWith('/sso-callback')) {
    return true;
  }
  if (path.startsWith('/reset-password')) return true;
  if (path.startsWith('/api/webhooks/stripe')) return true;
  if (path.startsWith('/api/cron/')) return true;
  return false;
}
