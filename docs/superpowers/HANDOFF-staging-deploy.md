# Handoff — Staging deployment (Fly + Neon) is LIVE; next is the EAS client build

**Date:** 2026-06-26
**Branch:** `dev` (all work merged — see PRs #80, #81, #82 below)
**Status:** Staging **backend** is fully deployed, verified, and seeded. The 3 admin
accounts can log in. **Remaining work: A5 (EAS preview build) + A6 (on-device checks)**
so the client can install the app and test. Then repeat for production (section B of
the checklist).

Runbook this follows: `docs/deploy-checklist-staging-first.md` (steps A1–A6 / B1–B4).
Architecture source of truth: `docs/deployment-runbook.md`.

---

## TL;DR — where to pick up tomorrow

1. **A5 — build the staging client with EAS.** `eas` CLI is **not on PATH** locally —
   run via `pnpm dlx eas-cli` or install it, then `eas whoami` (account `bazapilatess`).
   ```sh
   cd apps/mobile
   pnpm dlx eas-cli build --profile preview --platform android   # APK link
   pnpm dlx eas-cli build --profile preview --platform ios       # ad-hoc / TestFlight
   ```
   The `preview` profile in `apps/mobile/eas.json` already bakes the staging API URL +
   `EXPO_PUBLIC_LINK_HOST=baza-pilates-staging.fly.dev`. First iOS build auto-creates
   the APNs push key.
2. **A6 — on-device** (real device, not simulator): install the build, then verify
   invite/reset flows, the universal link opening the app, push notification icon, and
   booking/cancellation. (Checklist A6.)
3. Hand the 3 admins their logins (below) so they can build classes/packages/clients.

---

## Staging facts (live values)

- **Server:** https://baza-pilates-staging.fly.dev — **healthy** (`/api/health` → 200).
- **Fly app:** `baza-pilates-staging`, region `fra`, scaled `app=1 cron=1`.
- **Neon:** project `curly-silence-18007567`, branch `staging`. DB has schema +
  3 admin users, nothing else.
- **EAS project:** `baza-pilates` (`b9172506-9150-4e03-9fe9-42c71dcfa0b6`), owner `bazapilatess`.
- **Resend:** verified domain `contact.bazapilates.com`; robot user `baza-staging-server`
  (Developer role) holds the access token used for `EXPO_ACCESS_TOKEN`.

### Seeded admin logins (staging only)
Password for all three: **`PromeniMe123!`** (tell them to change it).
- tamara.basic@gmail.com — ADMIN ✅ login-verified
- milica.gardasevic.98@gmail.com — ADMIN ✅ login-verified
- dana.piper24@gmail.com — ADMIN ✅ login-verified

No trainers / clients / class types / packages — intentional. The admins build
everything in-app. Re-seed (idempotent, admins-only) with:
```sh
cd apps/mobile
DATABASE_URL="<staging NON-POOLED Neon URL>" RESEND_API_KEY="x" EXPO_ACCESS_TOKEN="x" \
  API_ADMIN_BOOTSTRAP_TOKEN="x" BETTER_AUTH_SECRET="0123456789abcdef" \
  pnpm exec tsx scripts/seed-staging-admins.ts
```
(The dummies only satisfy `env.server.ts`'s eager validation — the seed uses only
`DATABASE_URL`. Passwords are bcrypt; `BETTER_AUTH_SECRET` is irrelevant to the hash.
The script is `apps/mobile/scripts/seed-staging-admins.ts`, **untracked/temp** — not
committed.)

> Staging `API_ADMIN_BOOTSTRAP_TOKEN` (= `CRON_TOKEN`) was generated this session and
> set as a Fly secret. **Not recorded here** (don't commit secrets). To use it for a
> manual cron curl, either re-`fly secrets set` a fresh value, or recover it from where
> you saved it when you ran the A1 command. Generate prod tokens fresh.

---

## What's done (merged to dev)

- **#80** `fix(notifications)` — push-token 500s after SDK 56 dropped `Constants.installationId`
  (persisted-UUID device id + server reclaim-on-conflict). Unrelated to deploy; landed earlier.
- **#81** `chore(ios)` — `expo-build-properties` iOS deploymentTarget 16.4.
- **#82** `fix(deploy)` — the deploy blockers (see below).

### Fly secrets set on staging (all 9)
`DATABASE_URL` (non-pooled), `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`,
`APP_WEB_URL`, `BASE_URL`, `API_ADMIN_BOOTSTRAP_TOKEN`, `CRON_TOKEN` (= bootstrap token),
`EXPO_ACCESS_TOKEN`. Verify names with `fly secrets list -a baza-pilates-staging`.

---

## Gotchas hit this session (so you don't re-derive them)

1. **The Fly deploy MUST build locally:** `fly deploy -c fly.staging.toml --local-only`.
   `expo export` OOMs on Fly's small managed Depot builder. **Build args used:**
   `--build-arg CRON_BASE_URL=https://baza-pilates-staging.fly.dev --build-arg NODE_BUILD_HEAP_MB=8192`.
2. **Docker Desktop VM RAM was the real OOM ceiling**, not Node's heap flag. It was 3.8 GB
   → raised to ~10 GB in Docker Desktop → Settings → Resources. The export needs ~6 GB+
   available to the *VM*. Raising `--max-old-space-size` alone made it worse (grabbed RAM
   faster, OOM'd sooner). If a build OOMs, check `docker info | grep "Total Memory"` first.
3. **Run `fly` commands with `-a baza-pilates-staging`** (not just `-c fly.staging.toml`)
   when your shell isn't at repo root — the relative config path fails with "missing an
   app name." (`-c` is still needed for `fly deploy` since it carries the machine config.)
4. **`.dockerignore` had to exclude `.claude`** — it's 10 GB (worktrees/transcripts) and
   was being shipped as build context. Fixed in #82.
5. **Local seed scripts fail env validation** — `env.server.ts` eagerly `.parse()`s ALL
   required vars at import. Pass dummies for the ones the script doesn't use (see seed cmd).

## Checklist gaps to fix in `docs/deploy-checklist-staging-first.md`
The checklist (A1) was **missing `EXPO_ACCESS_TOKEN`** — it's a required server env
(`env.server.ts`), and without it `/api/health` 500s on every request → health check
fails → deploy won't go green. Also missing: the `--local-only` + Docker-RAM requirement,
and that it created 2 app machines (we scaled to `app=1 cron=1`). Update the doc before
the prod run (section B) so prod doesn't hit the same four walls.

---

## Production (section B) — NOT started
Repeat A1–A6 against `baza-pilates-prod.fly.dev` / Neon `production` branch. Use the
`production` EAS profile + `eas update --branch production`. **Generate fresh
secrets/tokens for prod** (don't reuse the staging ones above). Apple-account steps
(TestFlight) may still be blocked on enrollment — confirm before the iOS prod build.
