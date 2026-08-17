# VibeOps Cloud

**Hosted, multi-tenant edition of VibeOps** — accounts, synced projects, subscriptions (coming).

Local / offline edition: [dustinholdfast/vibeops](https://github.com/dustinholdfast/vibeops)

---

## Phase 3 status

| Layer | Status |
|-------|--------|
| Next.js App Router | ✅ |
| Clerk auth (sign-in / sign-up / protect) | ✅ scaffold |
| Landing + dashboard shell | ✅ |
| Drizzle schema (`projects.user_id`) | ✅ |
| REST API `/api/projects` | ✅ |
| UI still on Zustand + localStorage | ⏳ next slice |
| Stripe | Phase 4 |

---

## Setup

### 1. Clone & install

```bash
git clone https://github.com/dustinholdfast/vibeops-cloud.git
cd vibeops-cloud
git checkout phase-3-scaffold   # until merged
npm install
```

### 2. Environment

```bash
cp .env.example .env.local
```

Fill in:

1. **Clerk** — [dashboard.clerk.com](https://dashboard.clerk.com) → create app → copy
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
2. **Neon** (or any Postgres) — [console.neon.tech](https://console.neon.tech) → connection string
   - `DATABASE_URL`

### 3. Database

```bash
npm run db:push
```

### 4. Run

```bash
npm run dev
# http://localhost:3001
```

- `/` — marketing / redirect if signed in  
- `/sign-in`, `/sign-up` — Clerk  
- `/dashboard` — app (auth required)  
- `GET /api/health` — config check  
- `GET|POST|PUT /api/projects` — multi-tenant CRUD (auth required)

---

## Architecture (Phase 3)

```
app/                    Next.js App Router
  page.tsx              Landing
  sign-in / sign-up     Clerk hosted UI
  dashboard/            Protected shell → existing UI
  api/projects/         Multi-tenant REST API
middleware.ts           Clerk route protection
src/
  db/                   Drizzle schema + mappers
  components/           Client UI (from Local)
  store/                Zustand (interim localStorage)
  types/ lib/           Shared domain
```

**Tenancy:** every project row has `user_id` = Clerk user id. API always filters by the authenticated user.

**Interim data path:** the dashboard UI still reads/writes localStorage via Zustand. The API is ready; the next slice wires the store to `fetch('/api/projects')`.

---

## Client components note

All files under `src/components/` that use hooks must start with:

```ts
'use client';
```

If you hit a Next.js error about hooks in a Server Component, add that directive to the top of the file.

---

## Deploy (Vercel)

1. Import the GitHub repo in Vercel  
2. Set the same env vars  
3. Deploy  
4. Add the production URL to Clerk allowed origins  

---

## License

TBD for Cloud. Local remains MIT.
