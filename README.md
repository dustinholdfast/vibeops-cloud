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

See `.env.example` — includes `NEXT_PUBLIC_APP_URL` (local `http://localhost:3001` or your Vercel URL).

---

## Plans

| Plan | Projects | Price |
|------|----------|-------|
| Free | 5 | $0 |
| Pro | Unlimited | $12/mo or $120/yr |

Limits enforced on `POST` / `PUT /api/projects`.

---

## Routes

| Path | Notes |
|------|-------|
| `/pricing` | Public pricing + checkout |
| `/api/billing/checkout` | Create Stripe Checkout session |
| `/api/billing/portal` | Customer portal |
| `/api/billing/status` | Current plan + usage |
| `/api/webhooks/stripe` | Subscription sync |

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
