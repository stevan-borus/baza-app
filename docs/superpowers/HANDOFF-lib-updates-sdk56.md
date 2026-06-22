# Handoff — Lib updates SDK 54→56 + full dependency refresh

**Date:** 2026-06-22
**Worktree:** `/Users/stevanborus/Desktop/baza-app/.claude/worktrees/feat+lib-updates-sdk56`
**Branch:** `worktree-feat+lib-updates-sdk56` (base: origin/dev @ #76)
**Status:** All dependency upgrades DONE + green on the fast gate, integration, server bundle. **5 e2e specs still failing — the remaining work is to investigate and fix all 5.** No PR opened yet.

> ⚠️ Always operate from the worktree path above. Never `cd` into or touch the main checkout `/Users/stevanborus/Desktop/baza-app` except to read the dev baseline. Use absolute paths / `git -C`.

---

## What's done (committed on the branch, newest first)

```
a1cf564 fix(deps): add @opentelemetry/api for better-auth 1.6 Metro bundle
ad6c578 chore(deps): bump dev tooling — turbo, lefthook, playwright, vitest, tsx, @types/node
e60d203 chore(deps): take @legendapp/list 3; hold async-storage at SDK pin
f033b63 chore(deps): bump DB, auth, and app libraries to latest
39ba0fd chore(deps): upgrade Expo SDK 55→56 + migrate react-navigation imports
6fcad5f chore(deps): upgrade Expo SDK 54→55
2b991dc docs(deps): implementation plan for SDK 54→56 + lib refresh
ceba5c8 docs(deps): spec for SDK 54→56 + full library refresh
```

Spec: `docs/superpowers/specs/2026-06-22-dependency-updates-sdk56-design.md`
Plan: `docs/superpowers/plans/2026-06-22-dependency-updates-sdk56.md`

**Upgrades landed:** Expo SDK 54→56 (react 19.2.3, react-native 0.85.3, reanimated
4.3, all expo-* on 56, expo-router 56.2.11), Prisma 7.4→7.8, better-auth 1.4→1.6,
react-query 5.101, zod 4.4 (both pkgs), tailwind 4.3, @legendapp/list 2→3,
datetimepicker 9, dev tooling (turbo/lefthook/playwright/vitest/tsx/@types/node).
`expo-doctor` passes 21/21.

**Deliberately held / deferred (do NOT "fix" these without intent):**
- **oxlint pinned to 1.48.0** (exact + `pnpm.overrides` in root package.json). A clean
  lockfile regen floated it to 1.71, whose far stricter ruleset throws ~1644
  error-level + ~16k warnings (mostly the obsolete `react-in-jsx-scope`, sort-keys,
  no-magic-numbers). **User decided: oxlint adoption is its own separate PR.** Keep
  it pinned here.
- **async-storage held at 2.2.0** (SDK pin). v3 is a native major expo-doctor flags as
  mismatched; v3's scoped-storage feature is unneeded. Deferred.
- **@react-email/components at 1.0.12** — latest published but registry-flagged
  deprecated with no maintained successor. Email-stack migration deferred to its own PR.
- **victory-native appears UNUSED** (no source imports; only added `@shopify/react-native-skia`
  as its doctor-required native peer). Candidate for removal — flag in PR, don't act silently.

---

## Green so far (evidence)
- `pnpm lint` — 0 errors (oxlint 1.48)
- `pnpm check-types --force` — passes. **MUST use `--force`**: turbo cache leaks across
  this repo's worktrees and replays stale logs (`FULL TURBO` = not actually run here).
- `pnpm --filter mobile test:unit` — **443 passed** (email snapshots regenerated twice
  for benign react-19.2 RSC-comment / body padding:0 renderer churn).
- `pnpm test:integration` — **520 passed** (89 files). Prisma migrate status: no drift.
- Server bundle (`expo start --web`) — boots clean after the @opentelemetry/api fix.

---

## ⛔ The remaining work: 5 failing e2e specs

Full suite was **108 passed / 5 failed**. I re-ran the 5 against the **dev (SDK 54)
baseline** in the main checkout to separate regressions from drift. Result:

### Group A — 2 REGRESSIONS (pass on dev, fail on this branch) — MUST FIX
1. `test/e2e/admin-create-client.spec.ts:41` — create client with DOB
2. `test/e2e/auth-extended.spec.ts:158` — admin sends invite from clients screen

**Root cause (confirmed):** Both submit a form inside a `@gorhom/bottom-sheet`
(`components/ui/sheet.tsx` = `AppSheet`). The invite one opens a **stacked**
date-picker sheet (`components/ui/date-time-picker-web.tsx`, which renders
react-day-picker's `rdp-root` inside its own `AppSheet`) on top of the invite sheet.
bottom-sheet 5.2.11 ("modal status logic rewrite") + 5.2.14 ("window height from a
shared value on UI thread") changed present/dismiss animation timing. In the
web/headless Playwright env the **stacked picker sheet doesn't settle/dismiss after
Confirm**, so its `rdp-root` overlay keeps intercepting pointer events on the submit
button → Playwright "element is not stable" / "backdrop intercepts pointer events".

**Isolation done:** reverting bottom-sheet to 5.2.10 made `admin-create-client` pass
but NOT the stacked `auth-extended` invite case → the issue is a timing interaction
with the project's OWN `open`-prop-driven `present()`/`dismiss()` effect in
`sheet.tsx` (its own comments admit it "races with gorhom's animations"). bottom-sheet
is currently back at the committed 5.2.14. **Likely fix direction:** rework `sheet.tsx`
to drive present/dismiss off gorhom's `onChange`/`onAnimate` callbacks instead of the
raw `open` prop, and/or fix stacked-sheet dismiss ordering. **OPEN QUESTION not yet
answered: does this glitch also happen in a NATIVE simulator build, or is it web-only?**
Verify on the simulator before assuming it's test-only.

### Group B — 3 PRE-EXISTING (fail on dev too) — investigate, fix as part of this effort
3. `test/e2e/active-assignments-pagination.spec.ts:31` — "Pagi Client 007" not visible.
   Suspect now compounded by @legendapp/list v3 virtualization, but it ALSO fails on
   dev (SDK 54), so there's a pre-existing cause first. (v3 has no root export — imports
   were migrated to `@legendapp/list/react-native`; check whether v3 needs an explicit
   list height / estimatedItemSize to render in headless web.)
4. `test/e2e/admin.spec.ts:593` — "26: edit whole series" — `page.waitForResponse`
   15s timeout after a datetimepicker calendar interaction.
5. `test/e2e/booking-guardian-gate.spec.ts:175` — POST /api/bookings returns **404,
   expected 409**. Likely `bookableSessionA` undefined in setup, or a seed/route issue.
   API-level (deterministic), not a UI flake — good one to start with.

These 3 fail on dev today, so they're drift, but the task is now to fix ALL of them.

---

## Environment setup for a fresh session (IMPORTANT)

A fresh worktree is missing two things the e2e stack needs (both gitignored, not copied):

1. **`apps/mobile/.env`** — already copied into this worktree (from main checkout). If you
   re-clone the worktree, copy it again or the e2e server 500s (env.server zod parse
   throws → middleware bundle fails → webServer 120s timeout). See memory
   `project_worktree_env_file_for_e2e`.
2. **Prisma client** is generated; node_modules installed. If you reinstall:
   `pnpm install` then
   `DATABASE_URL=postgresql://postgres:postgres@localhost:5434/baza_app?schema=public pnpm exec prisma generate`

**Postgres:** container `baza-postgres` already runs on localhost:5434 (shared with main
checkout). `docker compose up -d` from the worktree will conflict on the container name —
just reuse the running one (`docker start baza-postgres` if stopped).

### Commands

```sh
# from the worktree apps/mobile/
# fast gate (run from worktree ROOT for check-types):
cd <worktree> && pnpm lint && pnpm check-types --force && pnpm --filter mobile test:unit

# e2e prepare (needs Prisma destructive consent — see below):
cd <worktree>/apps/mobile
PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="<the user's yes message>" pnpm test:e2e:prepare

# run only the 5 failing specs:
PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="..." pnpm exec playwright test \
  test/e2e/admin-create-client.spec.ts:41 \
  test/e2e/auth-extended.spec.ts:158 \
  test/e2e/active-assignments-pagination.spec.ts:31 \
  test/e2e/admin.spec.ts:593 \
  test/e2e/booking-guardian-gate.spec.ts:175
```

**Prisma destructive-consent gate:** `test:db:prepare`/`test:e2e:prepare` run `migrate
reset` on `baza_app_test` and are blocked for AI agents without
`PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=<user's exact consent text>`. Ask the user
for a plain "yes" each session; target is the local test DB, safe.

### Verifying regression-vs-drift (the pattern that worked)
The main checkout `/Users/stevanborus/Desktop/baza-app` is on `dev` (SDK 54) with a
working `.env`. To check if a failure pre-exists: prepare the (shared) test DB from there
and run the spec — `cd /Users/stevanborus/Desktop/baza-app/apps/mobile && pnpm exec
playwright test <spec>`. (Note: this reseeds the shared `baza_app_test`; re-prepare in the
worktree afterward.)

---

## Still TODO after the 5 are green (Task 6 of the plan)
- `pnpm build:server` (expo export -p web) smoke — the Fly deploy artifact.
- **Simulator dev build** (`pnpm ios`) — validates native-module bumps (reanimated,
  screens, svg, legend-list, datetimepicker). Native animation path; also the place to
  confirm the bottom-sheet fix works on native, not just web.
- Open PR (base `dev`). Body must list: phase breakdown, evidence (paste green outputs),
  the deferred items above (oxlint→own PR, async-storage held, react-email deprecation,
  victory-native maybe-unused), and the e2e fixes. Tick test-plan boxes only for what's
  actually green. No Claude-Session trailer, no attribution footer (global rule).
```
