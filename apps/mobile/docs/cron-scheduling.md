# Cron Scheduling (EAS Hosting)

Cron routes are now served by Expo API routes:

- `/api/cron/notifications/reminders`
- `/api/cron/notifications/package-expiry`
- `/api/cron/sessions/consumption`

## Trigger model

EAS Hosting does not provide Vercel-style `vercel.json` cron declarations.  
Use either:

- an external scheduler (GitHub Actions, cron-job.org, cloud scheduler), or
- in-process auto-start scheduler for long-lived server runtimes.

## Required headers

Every cron request must include:

- `x-cron-token: <API_ADMIN_BOOTSTRAP_TOKEN>`

## Example calls

```bash
curl -X POST "https://<your-server-origin>/api/cron/notifications/reminders?mode=scheduled" \
  -H "x-cron-token: ${API_ADMIN_BOOTSTRAP_TOKEN}"

curl -X POST "https://<your-server-origin>/api/cron/notifications/package-expiry?mode=scheduled" \
  -H "x-cron-token: ${API_ADMIN_BOOTSTRAP_TOKEN}"

curl -X POST "https://<your-server-origin>/api/cron/sessions/consumption?mode=scheduled" \
  -H "x-cron-token: ${API_ADMIN_BOOTSTRAP_TOKEN}"
```

## Local/manual runs

Use the helper script:

```bash
pnpm --filter mobile cron:reminders
pnpm --filter mobile cron:expiry
pnpm --filter mobile cron:sessions
```

Set:

- `CRON_BASE_URL` (defaults to `http://localhost:8081`)
- `API_ADMIN_BOOTSTRAP_TOKEN`

## Auto-start scheduler (optional)

Set these env vars to run cron jobs automatically when the server process starts:

- `CRON_AUTOSTART=true`
- `CRON_REMINDERS_INTERVAL_MS` (recommended `3600000`)
- `CRON_PACKAGE_EXPIRY_INTERVAL_MS` (recommended `43200000`)
- `CRON_SESSION_CONSUMPTION_INTERVAL_MS` (recommended `900000`)
