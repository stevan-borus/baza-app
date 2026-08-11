# Deploy Checklist — Staging First

A copy-paste runbook to take Baza from "everything merged" to "running on Fly +
installable build + universal links verified." **Do staging end-to-end, verify
on a device, then repeat for prod.** Source of truth for the architecture is
`docs/deployment-runbook.md`; this is the ordered execution path.

All commands run from **`apps/mobile/`** unless noted. You need `fly` (logged in
as `bazapilates@gmail.com`) and `eas`/`expo` CLIs authenticated.

Concrete values (from setup):
- Apps: `baza-pilates-staging` / `baza-pilates-prod`, region `fra`.
- Hosts: `baza-pilates-staging.fly.dev` / `baza-pilates-prod.fly.dev`.
- Neon project `curly-silence-18007567`, branches `staging` / `production`.
- EAS project `baza-pilates` (`b9172506-9150-4e03-9fe9-42c71dcfa0b6`), owner `bazapilates`.

---

## A. STAGING

### A1. Set staging secrets on Fly
Set once per environment. **`DATABASE_URL` must be the NON-POOLED staging URL**
(no `-pooler` in the host) — boot `prisma migrate deploy` takes an advisory lock
a PgBouncer pooler can drop; the app pools in-process via `@prisma/adapter-pg`.

```sh
fly secrets set -c fly.staging.toml \
  DATABASE_URL="<NON-POOLED staging Neon URL>" \
  BETTER_AUTH_SECRET="<random 32+ chars>" \
  RESEND_API_KEY="<resend key>" \
  RESEND_FROM_EMAIL="<address on a verified domain>" \
  APP_WEB_URL="https://baza-pilates-staging.fly.dev" \
  BASE_URL="https://baza-pilates-staging.fly.dev" \
  API_ADMIN_BOOTSTRAP_TOKEN="<token>"
# CRON_TOKEN must equal API_ADMIN_BOOTSTRAP_TOKEN:
fly secrets set -c fly.staging.toml CRON_TOKEN="<same token as above>"
```
Do **not** set `CRON_AUTOSTART` / `CRON_*_INTERVAL_MS` (old in-process scheduler, removed).

- [ ] Staging secrets set (DATABASE_URL is the non-pooled one)

### A2. Deploy staging
`CRON_BASE_URL` is a **build arg** (crontab is baked into the image) = the env's own host.

```sh
fly deploy -c fly.staging.toml --build-arg CRON_BASE_URL=https://baza-pilates-staging.fly.dev
fly scale count app=1 cron=1 -c fly.staging.toml   # exactly one cron or jobs double-fire
```

- [ ] `fly deploy` succeeds; boot log shows `migrate deploy` applied cleanly
- [ ] `fly scale` shows app=1 cron=1

### A3. Verify staging server
```sh
curl https://baza-pilates-staging.fly.dev/api/health          # -> {"status":"ok"} (or similar)
fly logs -c fly.staging.toml                                   # supercronic fires a job -> 200
# cron auth (replace TOKEN); should NOT 401:
curl -X POST https://baza-pilates-staging.fly.dev/api/cron/notifications/reminders \
  -H "x-cron-token: <CRON_TOKEN>"
```

- [ ] `/api/health` returns ok
- [ ] supercronic visible in `fly logs`, endpoint returns 200
- [ ] cron route accepts the token (200, not 401)

### A3b. Reseed staging with demo data (pre-launch only)

Staging carries seed/mock data, not real bookings, so it can be rebuilt freely.
Do this **after** a deploy whose migrations changed the schema — a half-migrated
seed reads as a broken app.

```sh
# Point at the NON-POOLED staging URL, same one A1 sets.
DATABASE_URL="<NON-POOLED staging Neon URL>" pnpm exec prisma migrate reset --force
DATABASE_URL="<NON-POOLED staging Neon URL>" TEST_ANCHOR_TIME='' \
  pnpm exec tsx scripts/test/seed-e2e.ts
```

The seed builds a full current month: trainers, clients on priced packages, a
gift, an unbacked attendance, and **trainer commission rates dated a year back**
so the payout screens show money instead of a "set a rate first" warning. No
manual data entry afterwards.

Stop doing this once the studio has real data — from then on the rates live in
Katalog → Procenti trenera, and an `effectiveFrom` must be at or before the
first month it should cover (a rate dated today does not apply to sessions
already held, which reads as a zero payout with no visible cause).

- [ ] reset + seed ran against the staging URL, not dev/prod
- [ ] Izveštaji → Honorari shows a non-zero total for the current month

### A4. Confirm the universal-link files are live (PR #74)
Now that the server is up, the `.well-known/` files are served at the host:
```sh
curl -i https://baza-pilates-staging.fly.dev/.well-known/apple-app-site-association
#   -> 200, JSON body with "DP99QDPC3A.com.bazapilates.app"
curl -i https://baza-pilates-staging.fly.dev/.well-known/assetlinks.json
#   -> 200, content-type should be application/json
```

- [ ] AASA reachable, contains the real Team ID appID
- [ ] assetlinks.json reachable as JSON, contains the release SHA-256

### A5. Ship the staging client — OTA first, full build only if native changed

**Decide this BEFORE running anything: most changes do not need a build.**

EAS cloud builds are capped per billing period (free tier: ~30 builds/month,
counted per platform — so one "deploy to both" costs 2). We hit 93% of that cap
on 2026-07-29 by rebuilding for JS-only changes. An OTA update costs zero build
credits and lands in seconds instead of ~20 minutes.

| What changed | Ship it with |
|---|---|
| JS/TS, JSX, styles, copy, locales, images in `assets/` | **`eas update`** (OTA) |
| New/updated native dep, `app.json` native config, Expo SDK bump, new permission, app icon/splash, `expo-*` package with native code | **`eas build`** |

If unsure: `eas update` is safe to try first — a JS bundle that needs missing
native code fails visibly on device, it doesn't corrupt the install. Rolling
back is `eas update:rollback`.

```sh
# JS-only change → OTA to everyone already on the preview channel:
eas update --branch preview --message "<what changed>"
```

Reaches existing TestFlight/Android installs on next app load
(`checkAutomatically: ON_LOAD`). `runtimeVersion` is `{"policy":"appVersion"}`
and `autoIncrement` only bumps the *build number*, so every install sharing
`expo.version` (currently `1.0.0`) gets the update. **Bumping `expo.version` in
`app.json` cuts existing installs off from OTAs** — that requires a new build.

Only when native actually changed:

```sh
eas build --profile preview --platform android   # -> APK link
eas build --profile preview --platform ios       # -> ad-hoc / TestFlight
```

`preview` bakes the staging API URL + `EXPO_PUBLIC_LINK_HOST=baza-pilates-staging.fly.dev`.
First **iOS** build auto-generates the APNs push key from the Apple account.

- [ ] Decided OTA vs build (native change? → build; otherwise → `eas update`)
- [ ] OTA published to `preview`, **or** builds succeeded (note the APK link)
- [ ] iOS only: APNs key auto-created on first ever build

### A6. On-device verification (the parts CI/local can't cover)
Install the build on a **real device** (universal-link + push verification is
unreliable on simulators/emulators).

- [ ] Invite flow: accept-invite link creates an account and signs in
- [ ] Password-reset flow updates the credential
- [ ] **Universal link:** tap an `https://baza-pilates-staging.fly.dev/accept-invite?token=…`
      link → the app opens directly (not the browser). Android verification can
      take ~20s after install. (This is Tier-1 from `apps/mobile/public/.well-known/README.md`.)
- [ ] **Push notification (Android):** fire a push → status-bar icon shows the
      tinted green **"B"** (PR #75), not a white square
- [ ] Booking + cancellation reflect in the availability endpoint

---

## B. PRODUCTION (repeat only after staging passes A1–A6)

### B1. Set prod secrets
Same keys as A1 but **production** values: non-pooled **production** Neon URL,
`APP_WEB_URL`/`BASE_URL` = `https://baza-pilates-prod.fly.dev`.
```sh
fly secrets set DATABASE_URL="<NON-POOLED production Neon URL>" \
  BETTER_AUTH_SECRET=... RESEND_API_KEY=... RESEND_FROM_EMAIL=... \
  APP_WEB_URL="https://baza-pilates-prod.fly.dev" \
  BASE_URL="https://baza-pilates-prod.fly.dev" \
  API_ADMIN_BOOTSTRAP_TOKEN="<token>"
fly secrets set CRON_TOKEN="<same token>"
```
- [ ] Prod secrets set (non-pooled production DATABASE_URL)

### B2. Deploy prod
```sh
fly deploy --build-arg CRON_BASE_URL=https://baza-pilates-prod.fly.dev
fly scale count app=1 cron=1
```
- [ ] Deploy succeeds, migrate applied, app=1 cron=1

### B3. Verify prod server + `.well-known/`
Repeat A3 + A4 against `baza-pilates-prod.fly.dev`.
- [ ] `/api/health` ok, crons fire, AASA + assetlinks live with the prod host

### B4. Ship prod client
Same OTA-vs-build decision as A5 — check that table first.

```sh
# JS-only change → no build credits, lands on next app load:
eas update --branch production --message "<what changed>"

# Native change (or the first prod release):
eas build --profile production --platform android   # APK link to distribute
eas build --profile production --platform ios
```
- [ ] Decided OTA vs build (see A5 table)
- [ ] OTA published to `production`, **or** prod builds done + APK link saved
- [ ] On-device prod smoke test (invite, reset, universal link, push, booking)

---

## Notes / gotchas
- **Campaign email** needs a verified Resend sending domain + SPF/DKIM/DMARC
  before it ships (transactional invites/resets work without it). See
  `docs/deployment-runbook.md` → "Email deliverability".
- **Exactly one** cron machine per env (`cron=1`) — more = every job double-fires.
- If `migrate deploy` hangs on boot, the `DATABASE_URL` is probably the **pooled**
  (`-pooler`) URL — swap to the non-pooled one and redeploy.
- Don't `prisma db push` against any DB, ever — `migrate deploy` only.
