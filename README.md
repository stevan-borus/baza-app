# Baza App Monorepo

Expo (mobile + web + server API routes) for Baza Pilates, built with Turborepo.

## Stack

- `pnpm` workspaces + Turborepo
- `apps/mobile`: Expo Router + Expo API routes/middleware + Tamagui + TanStack Query
- `packages/types`: shared schemas/types (Zod Mini oriented)
- Lint/format: Oxlint + Oxfmt

## License

Source-available under the [Business Source License 1.1](./LICENSE).
Production use is reserved until the Change Date (2030-05-13), after which
the code converts to Apache License 2.0. You may read, fork, build, and
contribute to the source; you may not use it to operate a pilates studio
or any other commercial service before the Change Date.

"BAZA", "BAZA Pilates Studio", and the BAZA logo are trademarks of
DANICA PIPER PR PILATES STUDIO BAZA NOVI SAD — see [TRADEMARKS.md](./TRADEMARKS.md).

## Theme

Main colors ported from `Desktop/baza-landing`:

- background: `#fdf7f4`
- brand: `#2e5b42`
- accent: `#6e1644`

Logo assets should be placed in `apps/mobile/assets/branding` and wired into screens.

## MVP Auth Model

- No public signup.
- Admin creates client invite by email.
- Client receives Resend email and completes password setup.
- Client can later request password reset via email link.

## Quickstart

```bash
pnpm install
cp apps/mobile/.env.example apps/mobile/.env
```

Fill `apps/mobile/.env`:

- `DATABASE_URL` (Postgres connection string, see below)
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `API_ADMIN_BOOTSTRAP_TOKEN`
- `BETTER_AUTH_SECRET` (32+ random chars)
- `APP_WEB_URL` (invite/reset callback base URL)

- `EXPO_PUBLIC_API_URL` — keep empty to use same-origin `/api/*` routes.

### Local database

From repo root, start Postgres (hardcoded values in `docker-compose.yml`, port 5434):

```bash
docker compose up -d
```

`DATABASE_URL` defaults in `apps/mobile/.env.example` match compose values. Then generate Prisma client and run migrations from `apps/mobile`:

```bash
pnpm --filter mobile exec prisma generate
pnpm --filter mobile exec prisma migrate dev
```

If you need seed data, add a seed script under `apps/mobile` and run it explicitly (Prisma 7 does not auto-seed after migrations).

Verify the workspace (CI gate sequence):

```bash
pnpm check-types
pnpm lint
pnpm format:check
pnpm build
```

Trigger cron jobs manually (useful in local dev):

```bash
API_ADMIN_BOOTSTRAP_TOKEN=your-token pnpm --filter mobile cron:reminders
API_ADMIN_BOOTSTRAP_TOKEN=your-token pnpm --filter mobile cron:expiry
```

Or run with explicit args:

```bash
CRON_BASE_URL=http://localhost:8081 API_ADMIN_BOOTSTRAP_TOKEN=your-token pnpm --filter mobile cron:run reminders -- --mode immediate --window-minutes 60
CRON_BASE_URL=http://localhost:8081 API_ADMIN_BOOTSTRAP_TOKEN=your-token pnpm --filter mobile cron:run package-expiry -- --mode immediate --window-days 7 --dry-run
```

Run app (client + server routes):

```bash
pnpm dev
```

- **Server API routes**: Expo server runs at `http://localhost:8081` when web server output is enabled. Health: `GET http://localhost:8081/api/health`.
- **Mobile**: Expo dev server starts; use iOS simulator, Android emulator, or Expo Go.

## Deployment

- Server API routes + web on EAS Hosting (Expo server output).
- Mobile on EAS Build + EAS Update.
- Database: Neon Postgres + Prisma migrations.
- Cron jobs can call:
  - `POST /api/cron/notifications/reminders`
  - `POST /api/cron/notifications/package-expiry`
  with header `x-cron-token: $API_ADMIN_BOOTSTRAP_TOKEN`.
  Endpoints support:
  - `mode=scheduled` (default production window)
  - `mode=immediate` (run instantly against a near-term window)
  - optional `dryRun=true` (simulate, no notifications persisted/dispatched)

## Prisma Migration

```bash
pnpm --filter mobile exec prisma generate
pnpm --filter mobile exec prisma migrate dev
```

## Docs

- `docs/api-contract.md` — API endpoint reference
- `docs/calendar-ux-spec.md` — Calendar UI/UX specification
- `docs/reports-spec.md` — Reports data model and output shapes
- `docs/cron-ops.md` — Cron job operations guide
- `docs/deployment-runbook.md` — Production deployment procedures
