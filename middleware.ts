import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { env } from '@/src/lib/env';
import { signInUrl } from '@/src/lib/sign-in-redirect';

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/sso-callback(.*)',
  '/pricing',
  '/api/health',
  '/api/auth/social',
  '/api/webhooks/stripe(.*)',
  '/api/cron/(.*)',
  '/api/email/unsubscribe',
]);

const isApiRoute = createRouteMatcher(['/api(.*)']);

const withClerk = clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  // protect() rewrites missing sessions to the Next 404 HTML page. APIs must
  // stay JSON 401 so a stale cookie does not look like a missing route. Pages
  // send the user to /sign-in instead of that 404.
  const { userId } = await auth();
  if (isApiRoute(req)) {
    if (!userId) {
      return NextResponse.json(
        { error: 'Please sign in again.', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }
    return;
  }

  if (!userId) {
    return NextResponse.redirect(
      signInUrl(req.nextUrl.origin, req.nextUrl.pathname + req.nextUrl.search)
    );
  }
});

/**
 * Checked per request, not once at module scope.
 *
 * `CLERK_SECRET_KEY` is a runtime secret. On Workers, bindings are not
 * guaranteed to be populated while the global scope is still evaluating, so
 * deciding *which middleware to export* from a module-scope constant risks
 * freezing the answer to "not configured" for the lifetime of the isolate —
 * every protected route serving 503 with the secret correctly set, and nothing
 * in the logs to say why. The same shape caused the database handle to be made
 * lazy in `src/db/index.ts`.
 *
 * A boolean per request is not worth optimising away for that.
 */
function clerkConfigured(): boolean {
  return Boolean(env('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY') && env('CLERK_SECRET_KEY'));
}

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  if (clerkConfigured()) return withClerk(req, event);

  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  return new NextResponse('Authentication is not configured', { status: 503 });
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
