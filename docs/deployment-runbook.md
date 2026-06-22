# Deployment Runbook (Fly server + EAS client)

## 1) Server + API Routes → Fly.io (`apps/mobile`)

The server (Expo Router `output: "server"`) runs as an always-on Fly container,
deployed as-written. One image, two processes (`app` web + `cron` supercronic).
**Two environments, two configs:** `fly.toml` = production (`baza-pilates-prod`),
`fly.staging.toml` = staging (`baza-pilates-staging`). Region `fra` (next to Neon
eu-central-1). Apps are pre-created with `fly apps create`.

```
# staging
fly deploy -c fly.staging.toml --build-arg CRON_BASE_URL=https://baza-pilates-staging.fly.dev
fly scale count app=1 cron=1 -c fly.staging.toml
# production
fly deploy --build-arg CRON_BASE_URL=https://baza-pilates-prod.fly.dev
fly scale count app=1 cron=1
```

`CRON_BASE_URL` is a **build arg** (the crontab is baked into the image — the cron
process curls the server's own public URL), so it must be the env's own hostname.
`EXPO_PUBLIC_*` are likewise inlined at export time → pass any needed for the SSR
web pages as `--build-arg`, not runtime secrets.

### Secrets (`fly secrets set ... [-c fly.staging.toml]`, set per environment)

- `DATABASE_URL` — the **NON-POOLED** Neon URL for that branch (production branch
  for prod, staging branch for staging). Non-pooled because the `app` process runs
  `prisma migrate deploy` on boot, whose advisory lock a PgBouncer pooler can drop;
  the server already pools in-app via `@prisma/adapter-pg`.
- `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- `APP_WEB_URL` / `BASE_URL` — the env's own `https://<app>.fly.dev`
- `API_ADMIN_BOOTSTRAP_TOKEN`, and `CRON_TOKEN` = the same value
  (`fly secrets set CRON_TOKEN="$API_ADMIN_BOOTSTRAP_TOKEN"`)
- TTL/feature envs as needed: `INVITE_TOKEN_TTL_HOURS`, `RESET_TOKEN_TTL_MINUTES`,
  `BAZA_CONSENT_GATE_ENABLED`.
- App-version nudge (optional; `/api/app-version`): `APP_MIN_VERSION_IOS`,
  `APP_LATEST_VERSION_IOS`, `APP_MIN_VERSION_ANDROID`, `APP_LATEST_VERSION_ANDROID`.
  Unset → endpoint reports the app's own `version`, so nobody is nagged or blocked.
  Bump `APP_LATEST_VERSION_*` when a new native build ships to soft-nudge users,
  and raise `APP_MIN_VERSION_*` only to hard-block versions below it. Per-platform
  because iOS and Android releases land at different times.

The old in-process scheduler is gone, so its `CRON_AUTOSTART` / `CRON_*_INTERVAL_MS`
envs are no longer read — do not set them.

### Email deliverability (BLOCKS campaign email)

Invites/resets are low-volume transactional. **Campaign** email is bulk marketing and will land in spam or get rate-limited from an unverified domain. Before campaign email ships:

1. Verify a dedicated **sending domain** in Resend (not a shared/sandbox domain); set `RESEND_FROM_EMAIL` to an address on it.
2. Configure **SPF, DKIM, and DMARC** DNS records for that domain and confirm Resend shows them verified.
3. Send a test campaign to a seed inbox and confirm inbox (not spam) placement.
4. Legal gate: marketing-consent clause is **drafted into `privacy-v1.md`** (en + sr) but still needs lawyer review — see `docs/legal/MARKETING-CONSENT-TODO.md`.

## 2) Database (Neon + Prisma)

1. Provision Neon Postgres database.
2. Set `DATABASE_URL` in hosting provider and local `.env`.
3. Run migrations from CI/CD or trusted workstation:
   - `pnpm --filter mobile exec prisma generate`
   - `pnpm --filter mobile exec prisma migrate deploy`

## 3) Mobile Builds (EAS)

Profiles live in `apps/mobile/eas.json`: `development` / `preview` / `production`.
Android is `buildType: apk` on every profile (distributed as a permanent EAS link
— no Play Store). Each profile bakes per-env `EXPO_PUBLIC_API_URL` (the Fly server
URL) and `EXPO_PUBLIC_LINK_HOST` (bare hostname). `preview` → staging, `production`
→ prod.

1. `eas init` to register the project (writes the EAS project id).
2. Build per environment:
   - `eas build --profile preview --platform android` → APK link
   - `eas build --profile preview --platform ios` → TestFlight / ad-hoc
3. Push OTA updates to the matching channel:
   - `eas update --branch preview` / `--branch production`

## 4) Cron Scheduling (supercronic, baked into the image)

Crons run in the `cron` process via **supercronic**, reading a crontab baked from
the manifest in `lib/server/cron-jobs.ts` (rendered by `scripts/gen-fly-crons.ts`
at image-build time against `CRON_BASE_URL`). No external scheduler.

- Run **exactly one** cron machine (`fly scale count cron=1`) or every job
  double-fires.
- The jobs POST with `x-cron-token: $CRON_TOKEN` — set `CRON_TOKEN` =
  `API_ADMIN_BOOTSTRAP_TOKEN` (see secrets above).
- Jobs (see the manifest for exact schedules): `notifications/reminders`,
  `notifications/package-expiry`, `campaigns/dispatch` (~30-min interval).
- Verify after deploy: `fly logs -c <config>` shows supercronic firing a job and
  the endpoint returning 200.

## 5) Post-deploy Verification

1. `GET /api/health` returns status `ok`.
2. Invite flow creates account and signs in.
3. Password reset flow updates credential account.
4. Client booking and cancellation reflect in availability endpoint.
5. Cron notification routes succeed with valid `x-cron-token` header:
   - `POST /api/cron/notifications/reminders`
   - `POST /api/cron/notifications/package-expiry`
6. Mobile/server checks pass:
   - `pnpm --filter mobile check-types`
   - `pnpm --filter mobile lint`
