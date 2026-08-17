# VibeOps Cloud

**Hosted, multi-tenant edition of VibeOps** — same focused project tracker, with accounts, sync, and subscriptions.

This repo is the Cloud product. The privacy-first, local-only edition lives at [dustinholdfast/vibeops](https://github.com/dustinholdfast/vibeops).

---

## Status

**Bootstrap phase.** The UI and domain logic are seeded from VibeOps Local v1.1.0. Next steps:

1. Auth (Clerk or Supabase)
2. Postgres + API (replace localStorage)
3. Multi-tenant data model (`user_id` on projects)
4. Stripe subscriptions
5. Deploy to Vercel

See the dual-product plan in project docs / conversation history.

---

## Current baseline (from Local)

- Work on this Now (soft limit 3)
- Rotting detector, In Flight, Needs Attention
- Stages, priority, health, target dates, progress, links, activity
- Export / Import JSON (will become Local → Cloud migration path)
- Dark UI + logo mark

Data still uses client-side Zustand + localStorage until the backend lands.

---

## Local development

```bash
npm install
npm run dev          # http://localhost:3001
npm run typecheck
npm test
```

---

## Relationship to Local

| | **VibeOps (Local)** | **VibeOps Cloud** |
|--|---------------------|-------------------|
| Data | Browser localStorage | Postgres, per-user |
| Auth | None | Login required |
| Hosting | Docker / self-host | Vercel |
| Pricing | Free / open | Free tier + paid plans |
| Promise | Nothing leaves the box | Convenience + sync |

Shared: UI components, domain types, deadline/priority rules.

---

## License

TBD for Cloud. Local remains MIT.
