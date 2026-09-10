# Staging on workers.dev

Getting `https://vibeops-cloud.dustin-eef.workers.dev` fully working against the
**development** Clerk instance and a **Neon branch**. No custom domain, no user
migration, nothing production touched.

This is the environment the Cloudflare migration gets verified in.

---

## The one thing that catches everyone

`NEXT_PUBLIC_*` values are **inlined by Next at build time**.

Setting `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` with `wrangler secret put` does
nothing for them — the value is already baked into the bundle, as `undefined`
if it was absent when you built. Every one of them must be present **when the
build runs**, and a change to any of them needs a rebuild, not just a redeploy.

The rest — `CLERK_SECRET_KEY`, `DATABASE_URL` — are read at runtime and belong
in Worker secrets.

---

## 0. Work in the right directory

There are two clones of this repository:

| Path | State |
| --- | --- |
| `E:\Projects\vibeops-cloud` | **current** |
| `E:\Projects\VibeOps Cloud\vibeops-cloud` | stale, at `2b90f04` |

The stale one predates uptime monitoring and the whole Cloudflare move. Nothing
below exists in it.

## 1. A Neon branch, not the production database

Create a branch in the Neon console. Use its **pooled** connection string, the
host containing `-pooler`.

Then set up its schema. `psql` is not required — the project can do this
itself:

```powershell
$env:DATABASE_URL="<paste the pooled string from the Neon console>"
npm run db:setup
```

```bash
DATABASE_URL="<paste the pooled string from the Neon console>" npm run db:setup
```

Note the `$env:` prefix in PowerShell. A bare `$DATABASE_URL` expands to
nothing, and the command would run against no database at all.

**Two steps, and the order matters.** `db:setup` runs both:

1. `drizzle-kit push` creates the tables from `src/db/schema.ts`. The SQL files
   *alter* those tables; none of them creates `projects`, so running them first
   fails with `relation "projects" does not exist`.
2. `npm run db:apply` then applies the four SQL migrations in dependency order,
   which cover what Drizzle deliberately does not — notably the `uptime_alerts`
   column, kept out of the Drizzle schema so that a missing migration cannot
   break the existing digest queries.

If the branch was copied from a database that already has the schema, run
`npm run db:apply` on its own. Every migration is safe to rerun.

## 2. Build-time values

Create `.env.local` — it is gitignored, and Next reads it automatically:

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_…
NEXT_PUBLIC_APP_URL=https://vibeops-cloud.dustin-eef.workers.dev
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…
```

Development keys, `pk_test_`. A `pk_live_` key will not work on a
`workers.dev` domain, and `npm run check:production-auth` exists to stop that
reaching production.

## 3. Runtime secrets

```bash
npx wrangler secret put CLERK_SECRET_KEY      # sk_test_…
npx wrangler secret put DATABASE_URL          # the Neon branch, pooled
npx wrangler secret put CRON_SECRET
npx wrangler secret put STRIPE_SECRET_KEY     # test mode
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put NEXT_PUBLIC_APP_URL   # also needed at runtime
```

`NEXT_PUBLIC_APP_URL` appears in both lists deliberately: inlined where the
client needs it, and read at runtime for Stripe redirect URLs.

Optional: `RESEND_API_KEY` and `EMAIL_FROM`. Without them, alerts and digests
report as skipped rather than failing.

## 4. Build and deploy

```bash
npm run deploy:worker
```

Ideally build on Linux — OpenNext warns against Windows. The `Worker build`
GitHub Action does this on every push.

## 5. Clerk dashboard

If sign-in is rejected, add the `workers.dev` origin to the development
instance's allowed origins.

GitHub sign-in is discovered from the instance at runtime, so the button simply
will not appear unless GitHub is enabled there. That is the expected behaviour,
not a bug.

---

## Verify

```bash
curl -s https://vibeops-cloud.dustin-eef.workers.dev/api/health
```

Expect `hasDatabase: true` and `hasClerk: true`. If either is false, the value
is missing from the half of the configuration that reads it.

Then, in order — each exercises something the one before it does not:

| Check | What it proves |
| --- | --- |
| Sign up, sign in, sign out | Clerk works on workerd |
| Open the dashboard | The middleware and the session both resolve |
| Create a project, edit it, reload | `projectTransaction`, the advisory lock and the version check through a **pooled** connection |
| Import and delete a project | The paths that also clean up monitoring |
| Add an uptime monitor, press **Check now** | Outbound fetch and the URL guard |
| `/uptime` | The SQL aggregation that has already shipped one bug |
| Stripe Checkout, then the Portal | Redirects and return URLs |
| `stripe trigger customer.subscription.updated` | Webhook signature verification under SubtleCrypto — the one failure that is **silent** |

That last one deserves the attention. If Web Crypto verification were wrong,
nothing would error visibly: webhooks would simply be rejected and
subscriptions would quietly stop syncing.

---

## What this does not cover

Production Clerk needs a custom domain, its own GitHub OAuth application, and —
unless the development accounts are disposable — the user-ID migration in
`CLERK_PRODUCTION_CUTOVER.md`. Keep that separate from the hosting change.
