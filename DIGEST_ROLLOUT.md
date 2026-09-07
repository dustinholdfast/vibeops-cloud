# Weekly digest email — rollout

A Monday email summarising what shipped, advanced, slipped and stalled. It
renders the same `buildPortfolioReview()` the dashboard uses, so the email and
the Review panel can never disagree.

## ⚠️ Order of operations

**1. Apply the migration first.**

```bash
psql "$PRODUCTION_DATABASE_URL" -f scripts/email-preferences.sql
```

Unlike the workspaces migration, an unapplied migration here **cannot break the
app** — nothing on the project request path reads `email_preferences`. The cron
returns `503 MIGRATION_REQUIRED` and no mail is sent. Still apply it first.

**2. Set the environment variables.**

| Variable | Effect if unset |
|---|---|
| `CRON_SECRET` | The cron route refuses every request. Nothing runs. |
| `RESEND_API_KEY` | Every send reports `skipped`. Nothing is delivered. |
| `EMAIL_FROM` | Same as above. |

Generate the secret with `openssl rand -hex 32`. On Vercel, add it as an
environment variable — Vercel Cron sends it automatically as
`Authorization: Bearer $CRON_SECRET`.

**3. Dry-run before you let it send.**

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://YOUR_DOMAIN/api/cron/weekly-digest"
```

The route is a **dry run unless called with `?send=1`**. It returns exactly who
would be mailed, at what address, with what subject line, and sends nothing.
Read that output before going further.

**4. Send to yourself.** Unsubscribe everyone else, or run against preview data,
then call it with `?send=1` and read the actual email.

**5. Enable the schedule.** `vercel.json` already declares it:

```json
{ "path": "/api/cron/weekly-digest?send=1", "schedule": "0 13 * * 1" }
```

Mondays 13:00 UTC. Vercel Cron is UTC-only, so this is one fixed time for
everyone — a reasonable morning in the Americas, afternoon/evening in Europe and
Asia. Per-user send times need a stored timezone; see *Known limits*.

## What gets sent, and to whom

A user is a candidate when they belong to at least one workspace, have not
unsubscribed, and have not been sent a digest in the last 6 days.

They are then skipped when:

- the account has no email address, or the address is **not verified**;
- nothing shipped, advanced, slipped **or** stalled in any of their workspaces.

That last rule matters: a quiet week produces no email. "Nothing happened" is
not worth an inbox visit — but a *stalled* project is, because that is the
product's whole point.

One email per person, with a section per workspace. Somebody in three workspaces
gets one message with three sections, not three messages.

## Consent and unsubscribing

- Users are subscribed by default. These are people who signed up for the
  product, and it is a product summary rather than marketing — but if you would
  rather make it opt-in, flip the `weekly_digest` default in
  `scripts/email-preferences.sql` to `0` before applying it.
- Every message carries a one-click unsubscribe link and the RFC 8058
  `List-Unsubscribe` / `List-Unsubscribe-Post` headers, so mail clients can offer
  their own unsubscribe button.
- `/api/email/unsubscribe` is public by necessity — a link in an email has to
  work in a browser that is not signed in. The token grants nothing but turning
  this one setting off.
- In-app, the toggle sits in the sidebar under the workspace switcher.

## Safety properties worth knowing

- **Dry run by default.** Sending requires `?send=1`.
- **No key, no mail.** Without `RESEND_API_KEY` every send is reported as
  skipped, so a preview deploy cannot mail real users.
- **Only confirmed sends are recorded.** A failure is retried on the next run
  rather than silently costing someone their week.
- **Idempotent.** `last_sent_at` means a retried or overlapping cron will not
  send twice.
- **Project names are escaped** before entering the HTML; a name is user input
  and a test covers the injection case.
- Batch capped at 200 recipients per invocation.

## Swapping the mail provider

The provider lives behind one function in `src/lib/email/send.ts`. Resend is the
default only because it needs an API key and a `fetch` call. Rewrite `deliver()`
and nothing else changes.

## Known limits

- **One send time for everybody** (13:00 UTC Monday). Per-user local delivery
  needs a timezone column and either hourly cron fan-out or a queue.
- **Batch cap of 200 per run.** Beyond that, the remainder waits for the next
  invocation — fine weekly at current scale, but it wants a queue before it is a
  real mailing list.
- **No bounce or complaint handling.** A Resend webhook writing back to
  `email_preferences` is the natural next step; repeated hard bounces should
  clear `weekly_digest`.
- **No open/click tracking**, deliberately.

## Tests

```bash
npm test          # includes 8 digest rendering tests
```

Covered: the send/skip decision, all three subject-line branches, the unsubscribe
and dashboard links, HTML escaping of project names, per-workspace headings, and
stalled-day reporting. Not covered by automated tests: the actual Resend call and
the cron route's Clerk lookup — exercise those with the dry run in step 3.
