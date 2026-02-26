# Cron Operations Playbook

This document covers safe operation of cron-based notification jobs in Expo API routes under `apps/mobile`.

## Endpoints

- `POST /api/cron/notifications/reminders`
- `POST /api/cron/notifications/package-expiry`

Both endpoints require:

- header `x-cron-token: <API_ADMIN_BOOTSTRAP_TOKEN>`

## Runtime Modes

Each endpoint supports:

- `mode=scheduled` (default): production behavior window
- `mode=immediate`: run now against a near-term window for testing
- `dryRun=true`: simulate recipients; no notifications are persisted/dispatched

Endpoint-specific windows:

- reminders: `windowMinutes` (used in `mode=immediate`)
- package-expiry: `windowDays` (used in `mode=immediate`)

## Environment Recommendations

- **dev**
  - no automatic schedule required
  - use manual trigger scripts with `mode=immediate`
  - run `dryRun=true` first, then real run
- **staging**
  - use same schedules as production or reduced frequency
  - validate payload counts with `dryRun=true` before enabling real sends
- **prod**
  - use external scheduler (orchestration of your choice) to call `/api/cron/*`
  - monitor route responses and push delivery status fields in `NotificationLog`

## Manual Trigger Commands

From repo root:

```bash
CRON_BASE_URL=http://localhost:8081 API_ADMIN_BOOTSTRAP_TOKEN=your-token pnpm --filter mobile cron:run reminders -- --mode immediate --window-minutes 60 --dry-run
CRON_BASE_URL=http://localhost:8081 API_ADMIN_BOOTSTRAP_TOKEN=your-token pnpm --filter mobile cron:run reminders -- --mode immediate --window-minutes 60

CRON_BASE_URL=http://localhost:8081 API_ADMIN_BOOTSTRAP_TOKEN=your-token pnpm --filter mobile cron:run package-expiry -- --mode immediate --window-days 7 --dry-run
CRON_BASE_URL=http://localhost:8081 API_ADMIN_BOOTSTRAP_TOKEN=your-token pnpm --filter mobile cron:run package-expiry -- --mode immediate --window-days 7
```

Shortcut scripts:

```bash
API_ADMIN_BOOTSTRAP_TOKEN=your-token pnpm --filter mobile cron:reminders
API_ADMIN_BOOTSTRAP_TOKEN=your-token pnpm --filter mobile cron:expiry
```

## Rollout Checklist

1. Confirm `API_ADMIN_BOOTSTRAP_TOKEN` is set for target environment.
2. Run `dryRun=true` manually and verify response counts.
3. Run manual real trigger and verify notification records are created.
4. Verify external scheduler job configuration exists and targets the correct `/api/cron/*` routes.
5. Confirm push token availability and `pushStatus` outcomes in logs.

## Incident Handling

- If unexpected volume appears:
  - disable cron schedule temporarily
  - run only with `dryRun=true` while investigating
- If push provider fails:
  - route responses still succeed with persisted notifications
  - inspect `pushStatus` for `EXPO_HTTP_*` or `DISPATCH_ERROR`
- If auth fails:
  - verify `x-cron-token` and environment variable consistency
