# Clerk production cutover

VibeOps Cloud currently uses a Clerk development instance at the Vercel preview
domain. Clerk production requires a custom domain; `*.vercel.app` cannot be used
as the production domain.

## Decisions required before cutover

1. Choose the custom application domain, such as `app.example.com`.
2. Decide whether accounts already created in the development instance are
   disposable or must retain their projects and subscriptions.

Clerk development and production instances have separate users. A person who
registers in production receives a different Clerk user ID, so simply replacing
the keys would make existing data appear missing.

### Where a Clerk user ID is stored

Twelve columns across seven tables — not the two this document claimed until
the inventory below was checked against the schema.

Seven hold the ID directly:

| Column | Note |
| --- | --- |
| `projects.user_id` | attribution only — *not* the access path |
| `subscriptions.user_id` | primary key |
| `workspaces.owner_user_id` | |
| `workspace_members.user_id` | part of the composite primary key |
| `workspace_invites.invited_by_user_id` | |
| `workspace_invites.accepted_by_user_id` | nullable |
| `email_preferences.user_id` | primary key |

Five more hold it as a **workspace** ID, because a personal workspace's id *is*
its owner's Clerk user ID:

| Column | Note |
| --- | --- |
| `workspaces.id` | where `personal = 1`; primary key |
| `projects.workspace_id` | |
| `workspace_members.workspace_id` | part of the composite primary key |
| `workspace_invites.workspace_id` | |
| `project_monitors.workspace_id` | added with uptime monitoring |

**That second group is what makes or breaks the cutover.** Access to a project
is granted by workspace membership, never by `projects.user_id`, which exists
only for attribution. Migrating the user-ID columns and leaving the workspace
IDs alone would update the cosmetic field and orphan the access path: every
user would sign in successfully and see nothing.

Team workspace IDs are generated and must never be rewritten. The `workspaces`
table is the only authority on which IDs are personal, so the migration reads
`personal = 1` rather than guessing from the ID's shape.

There are **no foreign keys** anywhere in this schema — every reference is a
plain `text` column. Nothing at the database level will catch a half-finished
migration, which is why the pre-flight checks below matter.

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
6. Rewrite the IDs with `scripts/migrate-clerk-user-ids.mjs`, which covers all
   twelve columns in one transaction. Write the verified mapping as JSON:

   ```json
   { "user_2oldAAA": "user_2newAAA", "user_2oldBBB": "user_2newBBB" }
   ```

   Dry run first — this is the default and writes nothing:

   ```bash
   DATABASE_URL=… node scripts/migrate-clerk-user-ids.mjs mapping.json
   ```

   It refuses to continue if any Clerk ID in the database is missing from the
   mapping (those users would lose access), if two old IDs map to one new ID,
   or if a new ID already exists in the database — each of which would collide
   on a primary key or silently merge two accounts. Read the per-column row
   counts and confirm they match what you expect, then:

   ```bash
   DATABASE_URL=… node scripts/migrate-clerk-user-ids.mjs mapping.json --apply
   ```

   Everything runs in a single transaction and re-verifies inside it, so an
   unexpected leftover rolls the whole migration back rather than leaving the
   database half-converted.
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

Keep the database backup until the cutover is verified.

A committed transaction cannot be reversed, so "undo" means migrating back.
Write the inverted mapping — new ID to old — and run the same script:

```bash
DATABASE_URL=… node scripts/migrate-clerk-user-ids.mjs mapping.reverse.json          # dry run
DATABASE_URL=… node scripts/migrate-clerk-user-ids.mjs mapping.reverse.json --apply
```

Produce that file at the same time as the forward mapping, before the cutover
starts, and keep both. The same pre-flight checks apply in reverse, so a
rollback is refused rather than half-applied if anything has drifted.

Then restore the previous production environment variables and redeploy. If
anyone signed up in production between the cutover and the rollback, their new
IDs will not be in the reverse mapping — the script will say so and refuse
until you decide what happens to those accounts.

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
