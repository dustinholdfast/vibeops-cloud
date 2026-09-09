# Per-project uptime monitoring — rollout

Per-project HTTP checks, 30 days of history, and an email when a project stops
answering (and another when it comes back).

Nothing here has been deployed, and no production database, Clerk, Stripe or
Vercel state was touched.

---

## Nothing is scheduled yet — pick a scheduler

**`vercel.json` deliberately does not schedule the uptime cron.** Vercel Hobby
only accepts once-daily cron expressions and rejects anything finer *at deploy
time*, so shipping a `*/5` entry would have failed the deployment on a Hobby
plan. Until a scheduler is wired up, monitors are configurable in the UI but
**nothing is being checked**.

On **Vercel Pro**, add this back to `vercel.json` and redeploy:

```json
{
  "path": "/api/cron/uptime?send=1",
  "schedule": "*/5 * * * *"
}
```

On **Hobby**, leave `vercel.json` alone and drive the endpoint externally.

The endpoint is scheduler-agnostic by design. "Due" is computed per monitor from
its own interval in SQL, so calling it more often than any monitor needs is
harmless — it finds nothing to do and returns. Any of these work:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://YOUR_DOMAIN/api/cron/uptime?send=1"
```

- a Cloudflare Worker on a cron trigger
- GitHub Actions on a `schedule:`
- Upstash QStash, cron-job.org, or any uptime-style pinger

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
leaves the weekly digest alone. Both switches are in the sidebar.

**Retention.** Check rows older than 35 days are pruned on each `send=1` run —
long enough for the 30-day figure.

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
| `app/api/cron/uptime/route.ts` | the sweep |
| `src/components/UptimeCard.tsx` | status, 24-hour strip, 24h/7d/30d, settings |
| `src/components/EmailPreferences.tsx` | replaces `DigestPreference`; both opt-outs |
