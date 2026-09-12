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

`CRON_SECRET` is required and must match the secret on `vibeops-cloud`:

```bash
npx wrangler secret put CRON_SECRET   # must equal CRON_SECRET on vibeops-cloud
```

`APP_URL` for the workers.dev staging origin is committed in `wrangler.jsonc`
`vars`. More important on workers.dev: a **service binding** to `vibeops-cloud`
(`VIBEOPS`). Same-zone Worker-to-Worker calls through global `fetch` return
Cloudflare error **1042**; the binding is what makes the sweep actually run.

After deploy, prove the wiring without waiting for the schedule:

```bash
curl -s https://vibeops-uptime-cron.<account>.workers.dev/
curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://vibeops-uptime-cron.<account>.workers.dev/run
```

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
