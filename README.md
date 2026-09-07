# VibeOps Cloud

**Hosted, multi-tenant edition of VibeOps** — accounts, synced projects, Stripe subscriptions.

Local edition: [dustinholdfast/vibeops](https://github.com/dustinholdfast/vibeops)

---

## Phase status

| Layer | Status |
|-------|--------|
| Next.js + Clerk + Neon | ✅ |
| Multi-tenant project API | ✅ |
| Stripe Checkout + Portal + webhooks | ✅ Phase 4 |
| Free (5 projects) / Pro (unlimited) | ✅ |
| Portfolio intelligence (daily brief, momentum, review) | ✅ |
| Team workspaces (roles, invites) | ✅ |

---

## Setup

```bash
git clone https://github.com/dustinholdfast/vibeops-cloud.git
cd vibeops-cloud
git checkout phase-4-stripe   # until merged
npm install
cp .env.example .env.local
```

Fill Clerk, `DATABASE_URL`, and Stripe vars (see below).

```bash
npm run db:push
npm run dev   # http://localhost:3001
```

### Stripe setup

1. [dashboard.stripe.com](https://dashboard.stripe.com) → **Product** “VibeOps Pro”
2. Add **two prices**: monthly $12, yearly $120 (or your amounts)
3. Copy Price IDs → `STRIPE_PRICE_PRO_MONTHLY` / `STRIPE_PRICE_PRO_YEARLY`
4. Copy Secret + Publishable keys
5. **Customer portal**: Settings → Billing → Customer portal → enable
6. **Webhooks** (local):
   ```bash
   stripe listen --forward-to localhost:3001/api/webhooks/stripe
   ```
   Put the `whsec_…` into `STRIPE_WEBHOOK_SECRET`
7. **Webhooks** (production): endpoint `https://YOUR_DOMAIN/api/webhooks/stripe`  
   Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`

### Env

See `.env.example` — includes `NEXT_PUBLIC_APP_URL` (local `http://localhost:3001`
or your HTTPS production custom domain).

Production Clerk requires a custom domain and `pk_live_…` / `sk_live_…` keys.
Before changing keys, follow [CLERK_PRODUCTION_CUTOVER.md](./CLERK_PRODUCTION_CUTOVER.md)
because project and subscription ownership is keyed by the Clerk user ID. Run
`npm run check:production-auth` with the production environment loaded before
deploying.

---

## Portfolio intelligence

The dashboard derives its guidance from the projects themselves — no extra data
entry.

| Surface | What it answers |
|---------|-----------------|
| Daily brief | The single project most worth your attention, and why |
| Review (7 / 14 / 30 days) | What shipped, advanced, slipped and stalled |
| Momentum (in the drawer) | Whether a project is accelerating, steady, slowing or stalled |

Ranking lives in [`src/lib/portfolio.ts`](./src/lib/portfolio.ts) and the windowed
review in [`src/lib/review.ts`](./src/lib/review.ts). Both are pure functions over
`Project[]`, so the scoring is readable and unit tested.

---

## Team workspaces

Projects belong to a **workspace**, not to a user. Every account gets a personal
workspace whose id is its Clerk user id, so nothing moves when the migration
runs. Team workspaces are created explicitly and joined by invitation.

| Role | Read | Edit projects | Manage people | Workspace + billing |
|------|------|---------------|---------------|---------------------|
| Owner | ✅ | ✅ | ✅ | ✅ |
| Admin | ✅ | ✅ | ✅ | — |
| Member | ✅ | ✅ | — | — |
| Viewer | ✅ | — | — | — |

- Access comes from `workspace_members` only — never from the `user_id` that
  created a row.
- A workspace bills on its **owner's** subscription, so a Free member of a Pro
  workspace gets Pro limits, and vice versa.
- Invitations are single-use, expire after 14 days, and are stored only as a
  SHA-256 hash. The link is shown once, and can only be redeemed by an account
  holding the verified email it was sent to.
- Requests name their workspace with the `x-vibeops-workspace` header (with a
  cookie fallback); it is always checked against membership before any read or
  write.

Apply [`scripts/team-workspaces.sql`](./scripts/team-workspaces.sql) **before**
deploying — see [WORKSPACES_ROLLOUT.md](./WORKSPACES_ROLLOUT.md).

---

## Plans

| Plan | Projects | Price |
|------|----------|-------|
| Free | 5 | $0 |
| Pro | Unlimited | $12/mo or $120/yr |

Limits enforced on `POST` / `PUT /api/projects`, counted per workspace and
resolved against the workspace owner's subscription.

---

## Routes

| Path | Notes |
|------|-------|
| `/pricing` | Public pricing + checkout |
| `/api/billing/checkout` | Create Stripe Checkout session |
| `/api/billing/portal` | Customer portal |
| `/api/billing/status` | Plan + usage for the active workspace |
| `/api/webhooks/stripe` | Subscription sync |
| `/api/workspaces` | List / create workspaces |
| `/api/workspaces/[id]` | Read, rename, delete |
| `/api/workspaces/[id]/members` | List members |
| `/api/workspaces/[id]/members/[userId]` | Change role, remove, leave |
| `/api/workspaces/[id]/invites` | List / create invitations |
| `/api/workspaces/[id]/invites/[inviteId]` | Revoke an invitation |
| `/api/workspaces/invites/accept` | Redeem an invitation token |
| `/invite/[token]` | Invitation landing page |

---

## Deploy to Cloudflare Workers

This repository is configured for Cloudflare Workers through OpenNext.

```bash
npm install
npm run typecheck
npm run build:worker
npm run preview:worker
```

For Cloudflare Workers Builds, use:

- Production branch: `main`
- Build command: `npm run build:worker`
- Deploy command: `npx wrangler deploy`
- Root directory: `/`

Configure every value from `.env.example` as a Cloudflare runtime variable or secret. The `NEXT_PUBLIC_` values must also be available during the build. Set `NEXT_PUBLIC_APP_URL` to the production Worker or custom-domain URL, then register `https://YOUR_DOMAIN/api/webhooks/stripe` as the Stripe webhook endpoint.
