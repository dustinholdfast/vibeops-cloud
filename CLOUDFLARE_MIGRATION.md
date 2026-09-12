# Vercel to Cloudflare Workers

The application code runs on Workers. What remains is configuration and a
staged cutover — neither of which can be done without production credentials.

Nothing has been deployed. Vercel is still serving production.

---

## What was changed, and why each was necessary

### The database handle is created on first use

`src/db/index.ts` used to build the client at module scope. That works under
Node and fails on Workers: bindings and secrets are not populated while the
global scope is still evaluating, so `process.env.DATABASE_URL` read there is
empty and every later request believes the database is unconfigured. It is now
created on the first `requireDb()` call, inside a request, and still cached per
isolate so connections are reused.

**Verified.** With `DATABASE_URL` set as a Cloudflare var, `/api/health`
reports `hasDatabase: true`, and a database-touching route opens a real TCP
socket — workerd logs `cannot connect to the specified address` when pointed
at a dead port. postgres.js runs on workerd.

### Stripe webhooks use Web Crypto

`stripe.webhooks.constructEvent` is synchronous and needs Node's `crypto`. On
Workers it throws, and the handler would reject **every** webhook as an invalid
signature — subscriptions silently stopping with nothing in the logs to suggest
a crypto problem. The route now uses `constructEventAsync` with
`Stripe.createSubtleCryptoProvider()`, and the client uses
`Stripe.createFetchHttpClient()` because the SDK otherwise reaches for Node's
http module. `export const runtime = 'nodejs'` is gone; it means nothing on
workerd.

**Not verified.** This needs a genuinely Stripe-signed request. See below.

### "Storage not ready" no longer swallows every error

`monitorStorageReady` and `digestStorageReady` caught everything and returned
false, so an unreachable database reported as *"monitoring is not set up"* and
the digest would mail nobody, week after week, for what looked like a missing
migration. They now return false only for `42P01` (undefined_table) and rethrow
anything else; both cron routes turn that into `DATABASE_UNAVAILABLE`. This
matters most immediately after a hosting change, when connectivity is exactly
what is suspect.

### A pre-existing 500 on the landing page

`app/page.tsx` rendered `GitHubAuthButton`, which uses Clerk hooks, while the
root layout mounts `<ClerkProvider>` only when a publishable key exists —
so `/` returned 500 whenever Clerk was unconfigured. **This was not caused by
the migration:** the Node runtime returns the identical 500 from the same code.
It arrived with GitHub sign-in, after the conditional-provider hardening. Now
guarded by `isClerkConfigured()`, like every other auth surface.

---

## `DATABASE_URL` must be Neon's pooled endpoint

Use the host containing `-pooler`.

Each Workers isolate opens its own connection, and Workers runs many
short-lived isolates. Against the direct endpoint that exhausts Neon's
connection limit long before traffic justifies it. `src/db/index.ts` also caps
each isolate at one connection on Workers and skips the type-fetch round trip.

The interesting part is that this was already safe. `prepare: false` was set
before any of this, and the advisory lock in `project-transaction.ts` is
`pg_advisory_xact_lock` — **transaction**-scoped, so it lives and dies inside
the unit a transaction-mode pooler pools. A session-scoped lock would have
broken silently under pooling.

Hyperdrive is an alternative and would cut connection latency further. It is
not required for correctness and was deliberately left out of the first move.

---

## Configuration

Every value from `.env.example`, set with `npx wrangler secret put <NAME>`.
The list is in `wrangler.jsonc`.

`NEXT_PUBLIC_*` values are **inlined by Next at build time**. A secret alone
does not reach client bundles — they must also be present in the build
environment.

---

## Build on Linux, not Windows

OpenNext prints this itself:

```
WARN OpenNext is not fully compatible with Windows.
WARN While OpenNext may function on Windows, it could encounter
     unpredictable failures during runtime.
```

The bundle in this repository was produced on Windows for verification only.
Build production in CI or WSL.

If `build:worker` fails with `EPERM … rm '.open-next'`, a `wrangler dev` is
still holding the directory. Stop it and rebuild.

---

## Cutover

Follow the order in `CLERK_PRODUCTION_CUTOVER.md` — Clerk's custom-domain
requirement does not go away, and the identity migration must not be combined
with a hosting change.

1. Deploy to the `workers.dev` hostname with a **Neon branch** and a
   **non-production** Clerk instance. Never the production database first.
2. Run the checks below.
3. Add the production custom domain to the Worker only after they pass.
4. Move DNS. Keep the Vercel deployment for rollback and watch auth, database,
   billing and 5xx rates.
5. Delete the `vercel.json` cron once nothing is served from Vercel.

**Keep `workers/uptime-cron` as a separate Worker.** On `workers.dev` it must
use `global_fetch_strictly_public` (or a service binding); plain same-zone
`fetch` returns Cloudflare error 1042 and the sweep never runs. Folding the schedule into
the app's own `wrangler.jsonc` looks tidier and does not work: the OpenNext
bundle exports only `fetch`, with no `scheduled` handler, so a cron trigger on
it would fail on every invocation. Replacing the entry point to add one means
owning a wrapper around generated code for no benefit.

Separate is also simply better here. The scheduler survives app redeploys, does
not depend on OpenNext's entry shape, and can point at Vercel or Workers by
changing one secret — which is exactly what a cutover needs.

### What I could verify locally

| Check | Result |
| --- | --- |
| `next build` | passes |
| `build:worker` (OpenNext bundle) | passes |
| `typecheck` | passes |
| Unit tests | 117/118 — the failure is pre-existing `rotting.test.ts` |
| `/`, `/pricing`, `/sign-in`, `/sign-up`, `/api/health` on workerd | 200 |
| `/dashboard`, `/uptime` with Clerk unset | 503 from middleware, as designed |
| Cloudflare vars reach `process.env` | yes — `hasDatabase: true` |
| postgres.js opens TCP on workerd | yes — real connect attempt |
| Unreachable database reports as such | `DATABASE_UNAVAILABLE`, not `MIGRATION_REQUIRED` |

### What needs credentials, and so needs you

Each of these can only fail in production, which is why they are step 2 and not
an afterthought:

- **Sign-in, sign-up, sign-out** end to end against a real Clerk instance.
- **A project save.** This exercises `projectTransaction`, the advisory lock and
  the version check through a pooled connection. The 38 database integration
  tests have still never been executed, so the transaction code is the least
  verified part of this move.
- **Stripe Checkout and Portal returns.**
- **A Stripe webhook.** `stripe trigger customer.subscription.updated` against
  the deployed URL. If signature verification were still broken this is the
  only place it would show, and it would show as silence.
- **The weekly digest and uptime sweep**, with `?send=1` withheld until a dry
  run looks right.
