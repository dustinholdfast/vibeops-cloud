# Clerk production cutover

VibeOps Cloud currently uses a Clerk development instance at the Vercel preview
domain. Clerk production requires a custom domain; `*.vercel.app` cannot be used
as the production domain.

## Decisions required before cutover

1. Choose the custom application domain, such as `app.example.com`.
2. Decide whether accounts already created in the development instance are
   disposable or must retain their projects and subscriptions.

Clerk development and production instances have separate users. A person who
registers in production receives a different Clerk user ID. VibeOps stores that
ID in both `projects.user_id` and `subscriptions.user_id`, so simply replacing
the keys would make existing data appear missing.

## Safe cutover order

1. Add the custom domain to the current Vercel project and confirm HTTPS is
   active. Keep the host unchanged for the authentication cutover so rollback
   has only one moving part.
2. Activate the Clerk production instance for that exact domain.
3. Mirror the current sign-in methods, branding, session lifetime, and OAuth
   provider configuration in the production instance.
4. Create or import production users. If data must be preserved, produce and
   verify an explicit old Clerk user ID to new Clerk user ID mapping.
5. Back up the production database.
6. In one database transaction, update `projects.user_id` and
   `subscriptions.user_id` using the verified mapping. Check for duplicate or
   missing mappings before committing.
7. Set these variables for Vercel's **Production** environment only:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_…`
   - `CLERK_SECRET_KEY=sk_live_…`
   - `NEXT_PUBLIC_APP_URL=https://<custom-domain>`
8. Keep development keys in local and preview environments. Do not expose the
   Clerk secret key in logs, commits, screenshots, or client-side variables.
9. Run `npm run check:production-auth` with the production environment loaded.
10. Redeploy production and test sign-up, sign-in, sign-out, dashboard access,
    project ownership, and Stripe customer-portal ownership.

## Rollback

Keep the database backup and the inverse user-ID mapping until the cutover is
verified. If authentication or ownership checks fail, restore the previous
production environment variables and reverse the ID migration transaction.

Do not delete the development Clerk instance during the cutover.

## Cloudflare migration

The existing OpenNext configuration successfully produces a Cloudflare Worker,
so moving after the Clerk cutover is feasible. It does not remove Clerk's custom
domain requirement and should not be combined with the identity migration.

Once production authentication and ownership are verified on Vercel:

1. Deploy the Worker to a temporary `workers.dev` hostname with its own preview
   database and non-production Clerk configuration.
2. Exercise authentication, project saves, Stripe Checkout and Portal returns,
   and Stripe webhook signature verification in the Workers runtime.
3. Add the production custom domain to the Worker only after those checks pass.
4. Move DNS traffic, retain the Vercel deployment for rollback, and monitor
   authentication, database, billing, and 5xx errors.

Cloudflare currently recommends vinext for new Next.js deployments, while still
documenting OpenNext for existing applications. Keep OpenNext for this migration;
evaluating vinext should be a separate compatibility project.
