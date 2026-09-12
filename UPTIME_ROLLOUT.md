# Per-project uptime monitoring — rollout

Per-project HTTP checks, 30 days of history, and an email when a project stops
answering (and another when it comes back).

The code is on `main`. It stays dormant until the migration is applied and the
secrets below exist — no production database, Clerk or Stripe state has been
touched.

---

## The scheduler: a Cloudflare Worker

On `workers.dev`, the scheduler Worker cannot call the app through ordinary
`fetch` — Cloudflare returns error **1042** for same-zone Worker-to-Worker
requests. `workers/uptime-cron` sets the `global_fetch_strictly_public`
compatibility flag so the public `APP_URL` fetch reaches the app. A `VIBEOPS`
service binding is also declared as a fallback.



`vercel.json` deliberately carries **no** uptime cron. Vercel Hobby accepts only
once-daily cron expressions and rejects anything finer *at deploy time*, so a
five-minute entry there would fail the deployment — and a daily check is not
monitoring.

The scheduler is [`workers/uptime-cron`](workers/uptime-cron/README.md), whose
README covers configuring and deploying it. Two values, neither committed:

```bash
npx wrangler secret put CRON_SECRET   # must equal CRON_SECRET on vibeops-cloud
# APP_URL is a wrangler var for workers.dev; a VIBEOPS service binding reaches the app
# (global fetch to *.workers.dev from another Worker returns Cloudflare 1042)
```

`CRON_SECRET` is shared by every `/api/cron/*` route and they refuse to run
without it. If it has never been set, generate one and put the same value in
both places — Vercel (Production, then redeploy) and the Worker:

```bash
openssl rand -hex 32
```

### It was a GitHub Action first, and that did not work

`.github/workflows/uptime.yml` scheduled this before the Worker did. GitHub's
scheduled workflows are best-effort on shared runners, and measured here they
were far worse than that phrase suggests:

```
workflow registered   2026-09-09 22:54Z
run 1                 2026-09-10 00:56Z   (+2h 02m)
run 2                 2026-09-10 05:48Z   (+4h 52m)
```

Two runs in seven hours where roughly 84 were due. The workflow has been
removed; do not reach for it again.

### On Vercel Pro

A Vercel cron would work and be one less moving part. Add this to
`vercel.json`, redeploy, and delete the Worker so both are not running:

```json
{
  "path": "/api/cron/uptime?send=1",
  "schedule": "*/5 * * * *"
}
```

"Due" is computed per monitor from its own interval in SQL, so overlapping
schedulers are harmless — the second finds nothing to do — but there is no
reason to run both.

---

## Apply the migration before deploying

```bash
DATABASE_URL="…" npm run db:apply uptime-monitors.sql

# PowerShell:  $env:DATABASE_URL="…"; npm run db:apply uptime-monitors.sql
# psql works too, if you have it installed — this project does not require it.
```

Additive and safe to rerun. It creates `project_monitors` and `project_checks`,
and adds `uptime_alerts` to `email_preferences`.

Deploying the code first is safe but does nothing useful: every entry point
checks that its storage exists and reports "not set up" rather than failing.
`uptime_alerts` is deliberately **not** in the Drizzle `emailPreferences` table —
Drizzle names every column in a `select()`, so listing it there would have broken
the existing weekly digest until this migration ran. It is read and written by
raw SQL in `monitor-service.ts` instead.

---

## Environment

No new variables. It reuses:

- `CRON_SECRET` — the uptime endpoint refuses to run without it, exactly like the digest
- `RESEND_API_KEY` / `EMAIL_FROM` — with these unset, alerts report as skipped instead of sending
- `NEXT_PUBLIC_APP_URL` — links in alert emails

---

## Try it without emailing anyone

Without `?send=1` the run is a **true dry run**: it performs the checks and
reports what it found and who it would email, but writes nothing.

That is stricter than the digest's dry run, and deliberately so — recording a
check consumes the up/down transition, so a dry run that wrote state would
swallow the very alert it was meant to preview.

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://YOUR_DOMAIN/api/cron/uptime"
```

```json
{
  "ok": true,
  "mode": "dry-run",
  "emailConfigured": true,
  "checked": 3,
  "down": 1,
  "alerts": 1,
  "outcomes": [
    {
      "projectName": "Riftdweller",
      "ok": false,
      "statusCode": 503,
      "status": "down",
      "alert": "down",
      "notified": []
    }
  ]
}
```

---

## How it behaves

**Up or down.** 2xx and 3xx count as up. Redirects are not followed — a redirect
could point at a private address — but a service answering 301 is still
answering.

**Not too twitchy.** A monitor goes down only after `failure_threshold`
consecutive failures (default 2), so one blip is not an email. It alerts on
transitions only: a service down for a day produces one email, not 288. A single
good response counts as recovered.

**A monitor that was broken from the moment it was added still alerts** once it
crosses the threshold — that is worth knowing about.

**Who gets emailed.** Every member of the project's workspace who has not turned
uptime alerts off, at their verified primary address. A personal workspace has no
`workspace_members` row, so its owner is resolved directly.

**Unsubscribing is per-list.** Alert emails link to
`/api/email/unsubscribe?token=…&kind=uptime`, which turns off alerts only and
leaves the weekly digest alone. Both switches live in the workspace menu.

**Retention.** Check rows older than 35 days are pruned on each `send=1` run —
long enough for the 30-day figure.

**Check now.** The drawer has a manual trigger that probes immediately and
answers inline. It runs the same pipeline as the sweep — probe, state machine,
record, alert on a transition — because a person clicking a button and the cron
waking up are discovering the same fact, and must not produce different history.

That it alerts is deliberate. Recording a check consumes the up/down
transition, so a manual check that stayed silent would swallow the alert the
next scheduled run would have sent. Only transitions alert, and a 15-second
per-project cooldown (`MANUAL_CHECK_COOLDOWN_MS`) stops the button being used
to hammer somebody else's site through our server.

It works on a paused monitor too — pausing stops the schedule, but asking
directly is still reasonable.

---

## The URL guard

Users supply the URL and the server fetches it, so an unchecked value would turn
the checker into a proxy into whatever private network it runs in.
`src/lib/uptime/target.ts` rejects:

- anything that is not `http:` or `https:`
- embedded credentials
- `localhost`, and `.local` / `.internal` / `.intranet` / `.home.arpa` suffixes
- private, loopback, link-local, CGNAT, benchmarking and multicast IPv4 —
  including `169.254.169.254`, the cloud metadata address
- private IPv6, including v4-mapped forms in **both** spellings (`::ffff:127.0.0.1`
  and the `::ffff:7f00:1` the URL parser rewrites it to)

It is re-checked at probe time, not just when saved, so a stored URL that
predates a rule change is still caught.

**Known limitation:** this blocks addresses that are *written down* as private.
It does not resolve DNS, so a public hostname pointing at a private address
(rebinding) is not caught. Not following redirects is part of the same
mitigation. Closing it properly needs resolve-then-pin-the-IP, which the
platform's `fetch` does not expose.

---

## Tests

```powershell
npm test              # 120 pass, no database needed
npm run typecheck
npm run typecheck:tests
npm run build
```

Against a real PostgreSQL — 81 pass, 46 of them for monitoring:

```powershell
docker run --rm -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:17
$env:TEST_DATABASE_URL="postgres://postgres:test@127.0.0.1:55432/postgres"
npm run test:db
```

Worth running. On their first execution they found that `dueMonitors` bound a
raw `Date`, which meant the scheduled sweep had never once worked, in any
environment, with any data.

New pure-logic suites, no network or database needed:

| File | Covers |
| --- | --- |
| `src/lib/uptime/target.test.ts` | every blocked range, and that neighbours of private ranges are not over-blocked |
| `src/lib/uptime/status.test.ts` | thresholds, one-alert-per-outage, recovery, first-check cases |
| `src/lib/uptime/history.test.ts` | uptime %, bucketing, current streak |
| `src/lib/email/render-alert.test.ts` | subjects, durations, escaping, unsubscribe link |

**Not run:** no browser smoke test, and no real check against a live URL — that
needs a deployment with `CRON_SECRET` set.

---

## Files

| Path | What |
| --- | --- |
| `scripts/uptime-monitors.sql` | the migration |
| `src/lib/uptime/target.ts` | what may be pinged |
| `src/lib/uptime/status.ts` | up/down state machine and alert rule |
| `src/lib/uptime/history.ts` | uptime %, buckets, streaks |
| `src/lib/uptime/probe.ts` | the one impure part: the HTTP check |
| `src/db/monitor-service.ts` | storage, tenant scoping, recipients, pruning |
| `src/lib/email/render-alert.ts` | down and recovery emails |
| `app/api/projects/[id]/monitor/route.ts` | GET / PUT / DELETE a monitor |
| `app/api/projects/[id]/monitor/check/route.ts` | the manual "check now" trigger |
| `src/lib/uptime/alerting.ts` | alert delivery, shared by the sweep and the manual check |
| `app/api/cron/uptime/route.ts` | the sweep |
| `src/components/UptimeCard.tsx` | status, 24-hour strip, 24h/7d/30d, settings |
| `src/components/WorkspaceMenu.tsx` | the uptime alerts switch, beside the digest one |
