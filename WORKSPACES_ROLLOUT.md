# Team workspaces — rollout

Projects move from being scoped to a Clerk user id to being scoped to a
workspace. This note covers what changed, why the migration is safe, and the
order it has to happen in.

## The migration principle

A user's personal workspace is given **the same id as their Clerk user id**.

That single choice is what makes this safe:

- `projects.workspace_id` backfills from `projects.user_id`, so no row changes
  hands and no data moves.
- The advisory lock in `projectTransaction` is now keyed on the workspace id,
  which for every pre-existing account is the same value it was keyed on before.
  Serialisation behaviour is unchanged.
- A request that names no workspace resolves to the caller's personal one, so a
  client that has not been updated keeps working.

## Order of operations

The application reads and writes `projects.workspace_id`, so **migrate first**.

1. Apply `scripts/team-workspaces.sql` to a preview database.
2. Run the browser smoke tests below against a preview deploy.
3. Apply `scripts/team-workspaces.sql` to production. It is additive and safe to
   rerun.
4. Deploy the application immediately after.
5. Watch `FORBIDDEN`, `PLAN_LIMIT`, `NOT_FOUND` and 5xx rates.

Do not use `npm run db:push` against production.

## What the migration does

- Creates `workspaces`, `workspace_members` and `workspace_invites`.
- Creates a personal workspace for every user id found in `projects` or
  `subscriptions`, and makes them its owner *and* a member.
- Adds `projects.workspace_id`, backfills it from `user_id`, then sets NOT NULL.
- Adds the workspace indexes. The old `projects_user_id_idx` is kept;
  `user_id` is still written for attribution.

## Access model

Access comes from `workspace_members` and nothing else. `projects.user_id` is
retained as "who created this row" and is never used for authorisation.

| Role | Read | Edit projects | Manage people | Workspace + billing |
|------|------|---------------|---------------|---------------------|
| Owner | ✅ | ✅ | ✅ | ✅ |
| Admin | ✅ | ✅ | ✅ | — |
| Member | ✅ | ✅ | — | — |
| Viewer | ✅ | — | — | — |

The rules live in `src/lib/workspace-roles.ts` as pure functions and are unit
tested. Notable ones:

- Ownership is never *assigned*; there is exactly one owner.
- Nobody may change the role of, or remove, a peer at their own level.
- Nobody may grant a role above their own.
- Anyone except the owner may remove themselves (leave).

## Billing

A workspace bills on its **owner's** subscription. A Free member working inside
a Pro workspace gets Pro limits; a Pro member inside a Free workspace is capped
at the Free limit. `/api/billing/status` reports the active workspace's plan and
sets `manageable: false` when the viewer is not the owner, so the UI does not
offer an upgrade the viewer cannot perform.

## Invitations

- The token is 32 random bytes from Web Crypto, delivered once as a link.
- Only its SHA-256 hash is stored, so a leaked database row is not redeemable.
- Redemption requires a **verified** email on the signed-in Clerk account
  matching the address the invitation was sent to, so a forwarded link is
  useless to anyone else.
- Single-use and marked redeemed inside the same advisory lock that adds the
  member. Expires after 14 days.

## Client behaviour worth knowing

- Requests name their workspace with the `x-vibeops-workspace` header; a cookie
  mirrors it so a cold page load resolves the same workspace. Both are checked
  against membership server-side.
- Draft recovery keys are now `vibeops-drafts:<user>:<workspace>`, so unsaved
  work in one workspace cannot surface in another.
- Switching workspace is refused while anything is unconfirmed, the same rule
  import and clear already followed.

## Tests

```powershell
npm test                    # pure logic + client store, no services needed
npm run typecheck
npm run typecheck:tests
npm run build
```

The database suite needs a **disposable** PostgreSQL and applies both
migrations in order, so each run also proves the migration produces a schema
this code works against:

```powershell
docker run --rm -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:17
$env:TEST_DATABASE_URL = "postgres://postgres:test@127.0.0.1:55432/postgres"
npm run test:db
```

## Still outstanding

- **Browser smoke tests** — need a preview deploy with credentials:
  - Create a team workspace, invite a second account, accept the link, confirm
    the projects are shared and the personal workspace is untouched.
  - Demote that account to viewer and confirm every mutation is refused while
    reading still works.
  - Try an invitation link from an account whose email does not match.
  - Start an edit, then try to switch workspace, and confirm the refusal.
  - Confirm the plan shown to a member is the workspace owner's.
- **Ownership transfer** is deliberately not implemented; the roles module
  refuses to assign `owner`. Add it as its own change, with the previous owner
  reassigned in the same transaction.
- **Invitation email delivery** is not wired up. The link is returned to the
  inviter to send by hand; adding a mailer does not change the redemption path.
