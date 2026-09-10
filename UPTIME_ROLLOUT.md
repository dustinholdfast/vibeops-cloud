# Per-project uptime monitoring — rollout

Per-project HTTP checks, 30 days of history, and an email when a project stops
answering (and another when it comes back).

The code is on `main`. It stays dormant until the migration is applied and the
secrets below exist — no production database, Clerk or Stripe state has been
touched.

---

## The scheduler: GitHub Actions

`vercel.json` deliberately carries **no** uptime cron. Vercel Hobby accepts only
once-daily cron expressions and rejects anything finer *at deploy time*, so a
`*/5` entry there would fail the deployment — and a daily check is not
monitoring.

The scheduler is [`.github/workflows/uptime.yml`](.github/workflows/uptime.yml)
instead: free on Hobby, five-minute schedule, no extra service.

### Two secrets, then it runs

**Settings → Secrets and variables → Actions → New repository secret**

| Secret | Value |
| --- | --- |
| `APP_URL` | The production origin, no trailing path — e.g. `https://your-domain.com` |
| `CRON_SECRET` | The same value as `CRON_SECRET` in the Vercel environment |

`CRON_SECRET` is shared by every `/api/cron/*` route, and the routes refuse to
run at all when it is unset. If it has never been set, generate one and put the
same value in both places — Vercel (Production, then redeploy) and here:

```bash
openssl rand -hex 32
```

Until both secrets exist the workflow fails fast with a clear message rather
than silently doing nothing.

### Verify it before trusting it

Run it once by hand: **Actions → Uptime checks → Run workflow**, ticking
**dry run**. That performs the checks and reports what it found without writing
anything or emailing anyone. Each run writes a summary table, and any project
that is not responding appears as a warning annotation.

### What the five minutes actually means

GitHub queues scheduled workflows on shared runners and can run them late or
skip a tick when busy — treat `*/5` as *roughly* every 5-15 minutes. Also note
GitHub disables scheduled workflows in a repository with **60 days of no
activity**; it emails first, and a push re-enables them.

**This only stays free while the repository is public.** Actions minutes are
unmetered on public repositories. Private ones bill a **minimum of one minute
per job**, so a five-minute schedule costs ~288 minutes a day and would exhaust
the 2,000-minute free allowance in about a week. If this repository is ever made
private, move to a Vercel Pro cron or an external pinger.

If neither is acceptable, the endpoint is scheduler-agnostic and a Cloudflare
Worker cron trigger, Upstash QStash, or cron-job.org all work the same way:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://YOUR_DOMAIN/api/cron/uptime?send=1"
```

### On Vercel Pro

Prefer Vercel cron — it is more punctual. Add this to `vercel.json`, redeploy,
and disable the GitHub workflow so both are not running:

```json
{
  "path": "/api/cron/uptime?send=1",
  "schedule": "*/5 * * * *"
}
```

"Due" is computed per monitor from its own interval in SQL, so overlapping
schedulers are harmless — the second one finds nothing to do — but there is no
reason to pay for both.

---

## Apply the migration before deploying

```bash
psql "$DATABASE_URL" -f scripts/uptime-monitors.sql
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
npm test              # 102 pass, including 3 new uptime suites
npm run typecheck
npm run typecheck:tests
npm run build
```

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
