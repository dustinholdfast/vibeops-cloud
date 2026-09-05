# Reliable project saves — status and rollout

Branch: `codex/reliable-project-saves`. Nothing has been committed, pushed or
deployed; no production database, Clerk, Stripe or Vercel state was touched.

## Current state

| Check | Result |
| --- | --- |
| `npm test` (deadline + client store) | 21 store tests + deadline suite pass |
| `npm run test:db` (PostgreSQL 17) | 29 integration tests pass |
| `npm run typecheck` | passes |
| `npm run typecheck:tests` | passes |
| `npm run build` | passes |
| `git diff --check` | clean |
| Browser smoke tests | **not run — needs credentials, see below** |

## What changed since the draft was handed over

### Server

- `createProject` and `importProjects` now check whether an incoming project id
  belongs to a different tenant and return `409 ID_TAKEN`. Previously a
  cross-tenant id collision hit the primary key and surfaced as a generic
  `503`, which the client could only retry forever with the same id.
- Import accepts older exports. Anything the database can default is optional
  (`progress`, `activity`, `stage`, `priority`, `health`, `nextAction`,
  `targetDate`, `createdAt`, `lastTouched`); only a valid `id` and `name` are
  required. Present-but-invalid values are still rejected, so a corrupt file
  cannot be written.
- An over-long activity history is truncated to the newest 50 entries on import
  instead of rejecting the whole file.
- `deleteProject` now rejects `version: 0` like `updateProject` does.
- `project-service.ts`, `project-transaction.ts` and `project-validation.ts`
  were reformatted to the repository's style and given comments explaining the
  concurrency and versioning rules.

### Client

- Recovered drafts are re-validated before use. `sessionStorage` is
  attacker-writable, so the stored `base`, `patch`, `request` and `creation` all
  go back through the same validators the server uses; anything malformed is
  dropped rather than merged into the project list.
- A failed create whose id is already taken now mints a fresh id, so **Retry**
  can actually succeed.
- `flush` refuses to send an update when no version is known (rather than
  guessing version 1 and conflicting), and no longer resurrects a draft that was
  removed while a request was in flight.
- Edits attempted during an import/clear/delete now say why they were ignored
  instead of silently disappearing.
- Import failures (unparseable JSON, wrong shape, unreadable file) are reported
  through the workspace notice. Previously an invalid file shape did nothing at
  all.

### UI

- Project rows show a one-word save indicator that opens the drawer; the full
  conflict comparison and the retry/discard actions live in the drawer only.
  The previous layout put the whole recovery panel inside every table row.
- `DraftSession` waits for Clerk to finish loading and clears drafts explicitly
  on sign-out and on account switches.

## Decision: sessionStorage, not IndexedDB

Recovery stays in `sessionStorage`, scoped by Clerk user id. It survives a
reload or a crashed page in the same tab, is naturally per-tab (so two tabs
cannot fight over one recovery blob), and disappears when the tab closes, which
limits how long unconfirmed data sits in a shared browser. A `beforeunload`
warning covers the deliberate-close case. Durable cross-restart recovery would
need IndexedDB plus a cross-tab ownership story; that is a larger change and the
stated requirement is that input survives failures, not browser restarts.

## Tests

```powershell
npm test                    # deadline + client store, no services needed
npm run typecheck
npm run typecheck:tests
npm run build
```

Database tests need a **disposable** PostgreSQL; the suite drops and recreates
`projects` and `subscriptions`, and refuses to run against a URL that looks like
production:

```powershell
$env:TEST_DATABASE_URL = "postgres://postgres@127.0.0.1:55432/vibeops_test"
npm run test:db
```

`scripts/test-db.mjs` documents two ways to get such a database (Docker, or a
local `initdb` cluster on a spare port).

The database suite builds the table in its **pre-migration** shape and then
applies `scripts/reliable-saves.sql`, so every run also proves the migration you
are about to run in production produces a schema this code works against.

Both concurrency tests hold the account's advisory lock on a separate connection
and assert the service blocks on it. They were verified to fail when the lock is
removed. An earlier "two concurrent creates" test passed with and without the
lock — the overlap window was too small locally — and was replaced.

## Production rollout

Order matters: the new code reads and writes `projects.version` and
`projects.last_mutation_id`, so **migrate before deploying**.

1. Apply `scripts/reliable-saves.sql` to a preview database and run the browser
   smoke tests against a preview deploy.
2. Apply `scripts/reliable-saves.sql` to production. It is additive and safe to
   rerun; existing rows start at version 1.
3. Deploy the application immediately after.
4. Watch `PLAN_LIMIT`, `CONFLICT`, `ID_TAKEN` and 5xx rates.

Do not use `npm run db:push` against production.

## Still outstanding

### Browser smoke tests (blocked on credentials)

There is no `.env.local` in this checkout — no Clerk keys and no `DATABASE_URL`
— so the signed-in app could not be exercised locally, and no preview deploy was
made. These still need a human run against a preview with the migration applied:

- Sign in, create, edit, refresh, confirm the values persisted.
- Disconnect the network, edit, reconnect, Retry, confirm exactly one server-side
  update (check `version` incremented by one).
- Two tabs editing the same project — confirm the second gets a conflict it can
  resolve.
- Hit the Free limit and confirm the typed name stays with an upgrade action.
- Import a valid file, an invalid file, and a pre-`version` export.
- Narrow/mobile layout of the row save indicator.

### Clerk production mode (blocked on owner access)

Unchanged from the original handoff, and still the riskiest remaining item.
Clerk development and production instances have separate user pools, and both
`projects.user_id` and `subscriptions.user_id` are keyed on the Clerk user id, so
switching keys without a migration plan orphans existing records.

1. Inventory Clerk development users against database `user_id` values.
2. Provision the Clerk production instance and custom domain.
3. Decide whether current users are disposable or must be migrated.
4. If migrating, build an explicit old-id → new-id map and move
   `projects.user_id` and `subscriptions.user_id` atomically, with a tested
   rollback.
5. Change keys in a Vercel preview first and verify authentication.
6. Only then change production credentials and verify billing ownership.

No credentials belong in this file, in source, in commits, or in logs.
