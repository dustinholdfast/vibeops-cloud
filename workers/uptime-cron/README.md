# Uptime cron

Calls `/api/cron/uptime?send=1` on the VibeOps deployment every five minutes.

## Why this exists rather than a GitHub Action

The first attempt at scheduling was `.github/workflows/uptime.yml`. GitHub's
scheduled workflows are best-effort on shared runners, and measured against
this repository they were far worse than "best effort":

```
workflow registered   2026-09-09 22:54Z
run 1                 2026-09-10 00:56Z   (+2h 02m)
run 2                 2026-09-10 05:48Z   (+4h 52m)
```

Two runs in seven hours against a five-minute schedule, where roughly 84 were
due. A monitor that checks twice a day is not a monitor. Cloudflare cron
triggers fire on time and are free.

## Why it is not a Vercel cron

Vercel Hobby only accepts once-daily cron expressions and rejects anything
finer at deploy time. On Vercel Pro a cron entry in `vercel.json` would work
and be one less moving part — see `UPTIME_ROLLOUT.md`.

## What it does not do

It holds no monitoring logic. VibeOps decides which monitors are due, from each
monitor's own interval, so this is a scheduler and nothing else. Calling late,
or twice, is harmless.

## Configure

Two values, neither committed:

```bash
npx wrangler secret put APP_URL       # https://your-domain.com — no trailing path
npx wrangler secret put CRON_SECRET   # must equal CRON_SECRET in the Vercel env
```

`APP_URL` is not really a secret; it is set this way only so the domain is not
committed. Put it in `vars` in `wrangler.jsonc` instead if you prefer.

Both must be present. If either is missing the Worker throws rather than
quietly doing nothing, so the failure is visible in the Cloudflare dashboard.

## Deploy

```bash
npm install
npm run deploy
npm run tail     # watch live invocations
```

## Verify locally

`wrangler dev --test-scheduled` exposes a `/__scheduled` route that fires the
handler on demand:

```bash
npm run dev
curl "http://127.0.0.1:8787/__scheduled"
```

Point it at a throwaway server rather than production while testing:

```bash
npx wrangler dev --test-scheduled --local \
  --var APP_URL:http://127.0.0.1:8796 \
  --var CRON_SECRET:test-secret
```

## What the logs say

Success is one JSON line per invocation:

```json
{"ok":true,"elapsedMs":131,"mode":"send","checked":3,"down":1,"alerts":1}
```

Failures name the cause. The two worth recognising:

| Log | Cause |
| --- | --- |
| `Sweep returned 401 …` | `CRON_SECRET` does not match the VibeOps deployment |
| `Sweep returned 503 …` | The uptime migration has not been applied |
