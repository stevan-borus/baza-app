# Deployment Runbook (Expo Server + EAS)

## 1) Expo Server + API Routes (`apps/mobile`)

1. Configure EAS Hosting for this project.
2. Configure required envs:
   - `DATABASE_URL`
   - `RESEND_API_KEY`
   - `RESEND_FROM_EMAIL`
   - `BETTER_AUTH_SECRET`
   - `APP_WEB_URL`
3. Enable server deployment in build env:
   - `EXPO_UNSTABLE_DEPLOY_SERVER=1`
4. Ensure production URL/origin is reflected in app config and envs.

## 2) Database (Neon + Prisma)

1. Provision Neon Postgres database.
2. Set `DATABASE_URL` in hosting provider and local `.env`.
3. Run migrations from CI/CD or trusted workstation:
   - `pnpm --filter mobile exec prisma generate`
   - `pnpm --filter mobile exec prisma migrate deploy`

## 3) Mobile Builds (EAS)

1. Configure EAS project in `apps/mobile`.
2. Set Expo public env:
   - `EXPO_PUBLIC_API_URL` (optional; leave empty for same-origin API routes)
3. Build native binaries:
   - `eas build --platform ios`
   - `eas build --platform android`
4. Push OTA updates:
   - `eas update`

## 4) Cron Scheduling

1. Configure external scheduler to call:
   - `POST /api/cron/notifications/reminders`
   - `POST /api/cron/notifications/package-expiry`
2. Send header `x-cron-token: $API_ADMIN_BOOTSTRAP_TOKEN`.
3. Validate scheduler runs and response payloads.

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
