import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/pricing',
  '/api/health',
  '/api/webhooks/stripe(.*)',
  // Authenticates with CRON_SECRET, not with a Clerk session.
  '/api/cron/(.*)',
  // Must work from a mail client, in a browser that is not signed in.
  '/api/email/unsubscribe',
]);

const withClerk = clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

const clerkConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
);

export default clerkConfigured
  ? withClerk
  : function middleware(req: NextRequest) {
      if (isPublicRoute(req)) {
        return NextResponse.next();
      }

      return new NextResponse('Authentication is not configured', { status: 503 });
    };

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
