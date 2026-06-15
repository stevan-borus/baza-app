# Cron Scheduling (Fly + supercronic)

Cron logic lives in standalone Expo API routes, each guarded by `x-cron-token`:

- `/api/cron/notifications/reminders`
- `/api/cron/notifications/package-expiry`
- `/api/cron/notifications/birthdays`
- `/api/cron/sessions/consumption`
- `/api/cron/campaigns/dispatch`

The schedules are the single source of truth in
[`lib/server/cron-jobs.ts`](../lib/server/cron-jobs.ts) and are kept honest by
`test/unit/cron-jobs.test.ts`.

## Trigger model

There is **no in-process scheduler** anymore — it pinned the server to one
stateful instance and double-fired if ever scaled. Jobs run as an **external,
single-count process** on Fly using [supercronic][supercronic], which supports
full cron expressions (Fly's native `--schedule` only does
hourly/daily/weekly/monthly).

`fly.toml` declares a dedicated `cron` process alongside the web `app` process:

```toml
[processes]
  app  = "pnpm run start:server"
  cron = "supercronic /app/crontab"
```

```bash
fly scale count cron=1   # EXACTLY one — more than one double-fires every job
```

The Docker image must include the `supercronic` binary and `curl`, and bake the
generated crontab at `/app/crontab`. The `cron` process needs `CRON_TOKEN` set
to the `API_ADMIN_BOOTSTRAP_TOKEN` secret.

## Generating the crontab

One crontab per environment (the base URL differs):

```bash
pnpm --filter mobile exec tsx scripts/gen-fly-crons.ts \
  --base-url https://baza-api-staging.fly.dev > crontab
```

Each line POSTs its endpoint with `x-cron-token: $CRON_TOKEN` and `curl -fsS`,
so a non-2xx fails the run and shows up in supercronic's logs.

## Required header

Every cron request must include `x-cron-token: <API_ADMIN_BOOTSTRAP_TOKEN>`.

## Local / manual runs

```bash
pnpm --filter mobile cron:reminders
pnpm --filter mobile cron:expiry
pnpm --filter mobile cron:sessions
```

Set `CRON_BASE_URL` (defaults to `http://localhost:8081`) and
`API_ADMIN_BOOTSTRAP_TOKEN`.

[supercronic]: https://fly.io/docs/blueprints/task-scheduling/
