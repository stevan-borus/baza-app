# Phase B prompt — Maestro native parity

Paste this into the next session.

---

Pick up Baza Pilates Phase B work on the `tests` branch. Phase A and Phase 2 are
done — full state is documented in `docs/test-plan.md` (73 Playwright web E2E
specs passing, 0 skipped; ~110 Vitest integration; ~40 unit). Now we mirror the
Phase A E2E suite in **Maestro** for native (iOS + Android), running against
release builds.

## Where to start (read first, do not skim)

1. `AGENTS.md` (root) — tooling rules, anti-flake rules, date-handling fragility,
   prisma-migrate rule, worktrees rule.
2. `docs/test-plan.md` — sections **"Maestro setup — preserved from prior work
   for Phase B"**, **"Phase B execution prompts"**, **"Common pitfalls
   encountered (to avoid in Phase B)"**, **".env.test template"**. The pitfalls
   list cost real time the first time; reuse it.
3. `apps/mobile/test/e2e/*.spec.ts` — the 73 Playwright specs are the spec for
   what each Maestro flow needs to cover.

## Recover the prior working setup

The previous-session snapshot at `/tmp/baza-tests-snapshot/` is gone (reboot).
Recover from git history. The original commits are:

- `974188f` — comprehensive test infrastructure (test:e2e:prepare, related
  scripts in `package.json`).
- `f5a4bec` — Maestro flows: `apps/mobile/.maestro/{config.yaml, helpers/,
  auth-admin.yaml, auth-trainer.yaml, auth-client.yaml, admin-create-session.yaml,
  admin-invite-client.yaml, client-calendar.yaml, client-notifications.yaml,
  trainer-notes.yaml, password-reset-request.yaml, password-reset.yaml}`.
- `22dadfa` — `apps/mobile/scripts/test/{build-e2e.sh, run-e2e.sh,
  patch-test-db.ts, get-latest-reset-token.ts}` and the `package.json` script
  changes.

Cherry-pick or `git show <sha> -- <path>` each file individually so you can
adapt them to the current `tests` branch (the Phase A seed at
`scripts/test/seed-e2e.ts` and the testID conventions have evolved).

The `apps/mobile/.maestro/` directory currently exists in the worktree but is
empty + untracked. That's a placeholder, not real work — overwrite freely.

## What to deliver

Mirror the Phase A Playwright suite as Maestro flows. The Playwright suite is
73 specs across 7 files (`auth-smoke`, `auth-extended`, `client`, `trainer`,
`admin`, `cron-reports-en`, `datetime-picker-smoke`). For Phase B, scope down
to the **9 critical journeys** the prior `f5a4bec` covered, plus:

- The 4 **edit/delete UI** flows that landed in Phase A but didn't exist when
  the original Maestro flows were written (admin class-type / package-type /
  room edit + delete; trainer note edit + delete).
- The trainer **per-client profile** flow (Phase 2 spec 46).
- The trainer **post-cron attendance markers** flow (Phase 2 spec 51 — needs a
  past session with consumption + a canceled booking; helper exists at
  `apps/mobile/test/e2e/helpers/db.ts:createPastAttendedSession`).

Use the existing testIDs — every Phase A spec uses them, so the Maestro
selectors will match without UI changes.

## Setup order (don't skip)

1. **Build.** Recover and run `apps/mobile/scripts/test/build-e2e.sh ios` (or
   `android`). Slow (~3-5 min iOS, longer Android). Re-run only when native
   code changes.
2. **DB prep + API server + simulator.** `run-e2e.sh ios|android` does all of
   it: prisma reset → seed → start Expo web on port 8010 → boot simulator →
   install app → warm-launch + terminate → run Maestro. The script's pitfall
   notes in the test plan are mandatory reading.
3. **Verify Reanimated 'PortalDispatchContext' crash is gone** on the current
   `dev` before adding new flows. If `dev`'s Reanimated config no longer
   triggers it, drop the `helpers/dismiss-error.yaml` retry from new flows.
4. **Update `seed-e2e.ts`** if needed. It's already the rich Phase A seed —
   the original prompt's note about "produce rich seed" is already done.

## Hard rules

- **Use `pnpm` scripts from `package.json`.** Don't invoke `prisma`,
  `playwright`, `vitest` directly. If a needed script doesn't exist, add it to
  `package.json` first.
- **Never `prisma db push`** — even on test DBs. The recovered `run-e2e.sh`
  uses `db push --force-reset`; **rewrite that to `prisma migrate reset
  --skip-seed --force`** as part of bringing the script back. (Test plan flags
  this as a Phase A todo that wasn't done.)
- **i18n every visible string in BOTH `locales/sr.json` AND `locales/en.json`.**
  No new strings without both.
- **No racy date math, no `setTimeout` as a primary wait** (see AGENTS.md and
  `test/e2e/helpers/dates.ts` for the pattern). Maestro has its own waits
  (`waitForAnimationToEnd`, `extendedWaitUntil`) — use those, not arbitrary
  pauses.
- **Date fragility carries over.** The seed reads the wall clock; flows that
  pick a date from the seeded window break Saturdays / future months. Until
  the anchor-time refactor lands (tracked in test-plan.md), pick dates with
  the same `nextReformerDayKey()`-style deterministic helper, OR seed
  flow-specific fixtures via `helpers/db.ts` instead of relying on the rich
  seed's session window.
- **Worktrees:** if you create one for Phase B work, all reads/edits/subagent
  prompts use the worktree path. Never touch the main checkout.

## When done

- All Maestro flows pass on iOS simulator AND Android emulator (both, not
  either-or).
- `pnpm test:e2e` (Playwright) still passes 73/73.
- `apps/mobile/.maestro/` is committed with the new flows.
- `docs/test-plan.md` updated: move Maestro section out of "Phase B" /
  "preserved" into a "Phase B status" section that mirrors the existing
  "Phase 2 status" section (counts, file list, how-to-run, known issues).
- Open a PR `tests → main` (or `tests → dev`, ask the user) summarising:
  total flows, platforms verified, runtime per platform, any anchor-time
  workarounds added.

## Don't

- Don't run flows on a device, only simulator/emulator (test plan rule).
- Don't add Detox or any other native test framework — already removed
  (commit `7916d11`), incompatible with RN New Architecture + Reanimated v4.
- Don't write Maestro flows for the cron / billing / EN-smoke specs — those
  layers are server-side or web-first, not native journeys.
- Don't "while I'm here" refactor the Phase A Playwright specs unless a
  testID conflict forces it.

You have full autonomy on flow naming, helper composition, and platform-
specific workarounds (the test plan's pitfall list documents the ones we
already paid for).
