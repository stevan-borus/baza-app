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
   - `POST /api/cron/campaigns/dispatch` — **30-min interval** (fires scheduled Campaigns; interval = worst-case send-time drift, marketing-tolerant)
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
