# VibeOps Cloud

**Hosted, multi-tenant edition of VibeOps** — accounts, synced projects, subscriptions (coming).

Local / offline edition: [dustinholdfast/vibeops](https://github.com/dustinholdfast/vibeops)

---

## Phase 3 status

| Layer | Status |
|-------|--------|
| Next.js App Router | ✅ |
| Clerk auth | ✅ |
| Drizzle schema (`projects.user_id`) | ✅ |
| REST API `/api/projects` | ✅ |
| Store ↔ API (load + optimistic sync) | ✅ |
| Stripe | Phase 4 |

---

## Setup

```bash
git clone https://github.com/dustinholdfast/vibeops-cloud.git
cd vibeops-cloud
git checkout phase-3-scaffold   # until merged to main
npm install
cp .env.example .env.local
```

### Environment (`.env.local`)

1. **Clerk** — [dashboard.clerk.com](https://dashboard.clerk.com)
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
2. **Postgres** — e.g. [Neon](https://console.neon.tech)
   - `DATABASE_URL`

```bash
bash scripts/add-use-client.sh   # once: ensure 'use client' on components
npm run db:push
npm run dev                      # http://localhost:3001
```

---

## How data flows

1. User signs in (Clerk)
2. `/dashboard` calls `loadProjects()` → `GET /api/projects` (filtered by Clerk `userId`)
3. UI mutations update Zustand optimistically, then `PATCH/POST/DELETE` the API
4. **Import** from Local export uses `PUT /api/projects` (replaces that user’s rows)

---

## Routes

| Path | Purpose |
|------|---------|
| `/` | Landing / redirect if signed in |
| `/sign-in`, `/sign-up` | Clerk |
| `/dashboard` | App (auth required) |
| `GET /api/health` | Env / readiness check |
| `GET/POST/PUT /api/projects` | List / create / bulk import |
| `GET/PATCH/DELETE /api/projects/[id]` | Single project |

---

## Deploy (Vercel)

1. Import repo → set env vars  
2. Deploy  
3. Add production URL in Clerk (allowed origins / redirect URLs)  

---

## License

TBD for Cloud. Local remains MIT.
