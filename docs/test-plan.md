# Baza Pilates — Test Plan (Phase A + Phase 2)

This plan is the output of a structured grilling session that locked in 32 decisions about test scope, framework, seed shape, and merge ordering. It is the source of truth for the test rewrite work on the `tests` branch.

**Phase A deliverable** (landed): ~220 unit + integration tests on the `tests` branch.
**Phase 2 deliverable** (landed): 71 Playwright web E2E tests, 2 deliberately skipped pending API/UI work. **Maestro native parity is Phase B**, deferred to a follow-up branch.

## Pre-requisites (must land before tests start)

The `package-class-scoping` branch must merge to `dev` first. It contains:
- Schema: `PackageType.classTypeId` (required FK, Restrict), `ClientPackage.classTypeId` + `ClientPackage.lateCancelHours` (snapshots).
- Booking enforcement: 409 `no_package_for_class` on mismatched eligibility.
- Availability filtering: client calendar hides sessions the client can't book.
- Billing transactionalization: BillingRecord + ClientPackage created atomically.
- Admin UI: ClassType pickers in PackageType create/edit; "Free / comp package" label on comp-assign sheet.
- Vitest replaces Jest entirely (no `jest.config.ts` / `jest.ui.config.ts` anymore).
- 6 new i18n keys in both `en.json` and `sr.json`.

## Test runner & frameworks

- **Vitest** — single runner for unit + integration. Two projects: `unit` (parallel, no DB) and `integration` (serial, real Postgres at `5434`, mocked auth).
- **Playwright** — web E2E. `apps/mobile/playwright.config.ts` already configured. Targets `127.0.0.1:8010` (Expo web export).
- **Maestro** — Phase B only. Existing `.maestro/*.yaml` flows stay in tree but are not executed in Phase A.

## DB lifecycle (per-spec-file reset)

Per Q2(b): each Playwright spec file resets the DB to the rich seed before its tests run. Implemented as a `test.beforeAll` per file that runs the same prep as `pnpm test:e2e:prepare`. Tests within a file share state.

Serial execution (`fullyParallel: false` retained per Q22). Per-worker DB parallelization deferred until CI runtime hurts.

## Rich shared seed (per Q12)

Each spec file's reset produces this baseline:

**Users (functional names per Q17):**
- 1 admin: `admin.e2e@example.test` / "Admin E2E"
- 2 trainers: `trainer.reformer@e2e.test` / "Trainer Reformer Lead", `trainer.energy@e2e.test` / "Trainer Energy Lead"
- 6 clients (the matrix):
  - `client.active.reformer@e2e.test` — active Reformer 12-pack with 8 remaining.
  - `client.active.energy@e2e.test` — active Energy 12-pack.
  - `client.expired@e2e.test` — Reformer pack expired 7 days ago.
  - `client.paused@e2e.test` — Reformer pack inside an active pause window.
  - `client.future@e2e.test` — Reformer pack `startsAt` is 7 days from now.
  - `client.empty@e2e.test` — no packages at all.

**Catalog:**
- 4 ClassTypes: Reformer pilates, Energy pilates, Moms&Minis, Golden age pilates.
- 5 PackageTypes (each scoped to one ClassType per the marketing data):
  - Reformer 12-pack / 30 days.
  - Reformer 8-pack / 30 days.
  - Energy 12-pack / 30 days.
  - Moms&Minis 8-pack / 30 days.
  - Golden age 8-pack / 30 days.
- 2 StudioRooms (Sala 1, Sala 2).
- ~14 days of recurring Sessions across all four programmes, populated **via the recurring-sessions API** (incidentally smoke-tests the recurring create path).

## Selector strategy (per Q16 follow-up)

Industry-standard accessibility-first priority:
1. `getByRole('button', { name: t(...) })` — primary.
2. `getByLabel`, `getByPlaceholder` for form inputs — should use real labels for a11y.
3. `getByText` for non-interactive labels.
4. `getByTestId` — last resort. Keeps existing `tab-clients`, `tab-calendar`, `tab-notes` testIDs; extends pattern only where role/label/text isn't unambiguous.

i18n: tests import locale JSON and reference keys via the actual translated string (`getByRole('button', { name: sr['admin.manage.sheetNewPayment'] })`). Survives copy edits without breaking, breaks when keys are removed (intentionally).

## Language coverage (per Q16)

- Full functional E2E suite in **Serbian** (default).
- 4-test **English smoke suite**: admin sign-in, client sign-in, trainer sign-in, client books a session.
- 1 unit test asserting `sr.json` and `en.json` have identical flat-key sets (the workhorse for translation correctness).

## Test inventory

### E2E (Playwright web, Serbian default) — ~68 tests

#### Auth — 11 tests (Q18 b)
1. Admin sign-in lands on admin landing.
2. Trainer sign-in lands on trainer landing.
3. Client sign-in lands on client landing.
4. Sign-out clears session.
5. Wrong password shows error.
6. Admin invites client → invite token recorded.
7. Client opens invite link → activation → password set → signed in.
8. Expired invite token → error UI.
9. Used invite token (already activated) → error UI.
10. Client requests password reset → reset link recorded.
11. Expired reset token → error UI.

(Non-admin accessing admin route is integration-tested instead — no UI surface needed.)

#### Admin — 28 tests (Q27 trimmed)
**Catalog:**
12. Create ClassType.
13. Edit ClassType.
14. Delete ClassType (no dependents) succeeds.
15. Create PackageType (with required ClassType picker).
16. Edit PackageType (changing classTypeId only affects future ClientPackages).
17. Delete PackageType (no dependents) succeeds.
18. Create StudioRoom.
19. Edit StudioRoom.
20. Delete StudioRoom.

**Scheduling (Q14 c):**
21. Create single session.
22. Edit single session.
23. Delete single session.
24. Create recurring series (Mon/Wed/Fri × 4 weeks → 12 sessions).
25. Edit single occurrence in series.
26. Edit whole series.
27. Delete single occurrence.
28. Delete whole series.
29. Conflict: room double-booked → rejected.
30. Conflict: trainer double-booked → rejected.

**Client management:**
31. Send invite.
32. View client list with package status indicators (active/expired/paused).
33. Pause client's package.
34. Deactivate client.

**Billing (Q11):**
35. Flow 1 happy: record payment + auto-assign package atomically.
36. Flow 1 status: even when body omits status, result is CONFIRMED.
37. Record payment without package (drop-in).
38. Flow 2: assign comp package directly (no BillingRecord).
39. View billing history (paginated).

#### Trainer — 12 tests (Q25 c)
40. Trainer signs in, lands on schedule, sees only their assigned sessions.
41. Trainer opens clients list, sees only linked clients.
42. Trainer creates a note for a linked client.
43. Trainer edits an existing note.
44. Trainer deletes a note.
45. Trainer attempts note for non-linked client → 403/blocked UI.
46. Trainer attempts to view non-linked client's profile → blocked.
47. Note `by-client` view groups notes correctly.
48. Note `by-session` view groups notes by session.
49. Note for past session — creatable, readable.
50. Clients list search/filter — type a name, list filters.
51. Trainer sees session attendance state post-cron (consumed/cancelled markers).

#### Client — 12 tests (Q26 c)
52. Sign in, home shows active package + upcoming sessions.
53. Open calendar — see sessions filtered by class types client has packs for.
54. Tap session → details (trainer, room, capacity, waitlist count).
55. Book a session → confirmation, sessionsRemaining displayed correctly.
56. Cancel before late-cancel cutoff → no consumption.
57. Cancel after cutoff → consumption (forfeit).
58. Try to book full session → join waitlist.
59. Waitlist promotion: someone cancels, client promoted, notification + booking auto-created.
60. View notification list, mark as read.
61. Try to book class without package → 409 (matches Q6 enforcement). Tests both visibility filter (session not shown) AND server rejection (if cache stale).
62. Edit profile + change language.
63. Sign out.

#### Reports — 2 smoke tests (Q19 b)
64. Admin opens Attendance report — page renders, ≥1 row visible.
65. Admin opens Utilization report — same shape.

#### Cron `cron:sessions` E2E — 3 tests (Q20)
66. Session ends, no cancel → cron decrements sessionsRemaining by 1.
67. Cancel before late-cancel cutoff → cron does NOT decrement.
68. Cancel after cutoff (late cancel) → cron decrements (forfeit).

(Triggered via direct POST to `/api/cron/sessions/consumption` with test token per Q21.)

### English smoke — 4 tests
1. Admin sign-in (English).
2. Client sign-in + sees English calendar with ≥1 session.
3. Trainer sign-in (English).
4. Client books a session (English).

### Integration (Vitest, real Postgres) — ~110 tests

**API contract per endpoint** (one happy path + happy-path variants + auth/role enforcement):
- `auth/*` — sign-in, sign-out, sessions.
- `invites` — create, redeem, expire, revoke (per Q27 push-down), resend.
- `bookings` — create, cancel, list, 409 path, late-cancel cutoff handling.
- `sessions` — list (admin/trainer scoping), create, edit, delete.
- `sessions/availability` — admin/trainer/client variants; client filter eligibility.
- `sessions/recurring` — create series, edit single occurrence, edit series, delete patterns.
- `packages/types` — CRUD with classTypeId; delete-with-dependents → 409 (per Q5 + Q27).
- `packages/client-packages` — Path B create with snapshot; pause; resume.
- `billing` — Flow 1 atomic happy + atomicity (rollback on partial failure); Flow 1 status defaulting; Flow 2 distinction.
- `clients` — list, detail, deactivate, reactivate (per Q27 push-down).
- `trainings` — list, scoping.
- `rooms` — CRUD.
- `trainer-notes` — CRUD with scope enforcement.
- `notifications` — list, mark-read, persistence assertions.
- `reports/attendance` — empty data, single user full attendance, mixed attendance + cancellations, late-cancel forfeit counting, date-range filtering, role enforcement.
- `reports/utilization` — same matrix.

**Crons:**
- `reminders` — manual trigger, asserts notification rows created for upcoming sessions.
- `package-expiry` — manual trigger, asserts notification rows for packs expiring in N days.
- `sessions/consumption` — manual trigger, full matrix (consume on no-cancel, skip on pre-cutoff cancel, consume on post-cutoff cancel).
- All three: 401 without `x-cron-token`.

**Notifications integration (Q15 b + Q29):** mock the Expo push provider; assert push was called with correct payload for each notification type (booking, cancellation, package-expiry, reminder, waitlist promotion).

### Unit (Vitest, no DB) — ~40 tests

- `findEligibleClientPackage` — already 8 tests on `package-class-scoping` branch. Keep.
- Auth guards (`requireAuth`, `requireRole`) — ~6 tests: no session, expired, wrong role, allowed role, deactivated user, multi-role.
- Trainer scope (`trainerLinkedToClientProfile`) — ~3 tests.
- Date/time math:
  - Late-cancel cutoff calculation — ~5 tests covering exactly-at-cutoff, DST transitions, Belgrade UTC+1/+2 boundaries.
  - Recurring-series weekday math — DST-spanning, leap year, month boundaries — ~5 tests.
- Email template snapshot tests (per Q29) — 4 tests, one per template.
- i18n key parity — 1 test.
- Opportunistic helpers in reports/aggregations if any exist as pure functions.

## Phase 2 status (E2E layer)

**72 specs passing, 1 skipped, 0 failing.** Full E2E suite runs in ~5 minutes locally.

### Resolved infrastructure issues

Each of these blocked at least one test class on the `tests` branch and was fixed in the course of writing the suite. They are not test-only fixes — they were real product or platform bugs that the E2E layer surfaced first.

- **tslib interop error in Expo Router web export.** tslib's `package.json` `exports` map routes the `node` import condition (which Expo CLI sets when bundling for SSR) to `./modules/index.js`, whose `import tslib from '../tslib.js'` + destructure pattern fails under Metro's CJS interop because the CJS `tslib.js` does not set `module.exports.default`. First consumer to hit this on `/sign-in` was `framer-motion@6.5.1` (pulled in by `moti`). Fix: a `resolver.resolveRequest` shim in `apps/mobile/metro.config.js` redirecting every `'tslib'` request to `tslib/tslib.es6.mjs`.
- **`apiFetch` 401-ing on web.** It forced `credentials: "omit"` and pulled the cookie via `authClient.getCookie()` (expo-secure-store, no-op on web). Now uses `credentials: "include"` on web so the browser cookie jar carries the session.
- **`@gorhom/bottom-sheet`'s `BottomSheetTextInput` crashed on web** (`State.currentlyFocusedInput is not a function`). The `Input` wrapper now falls back to plain `TextInput` on `Platform.OS === "web"`.
- **`Button`'s `active:scale-[0.97]` made Playwright stability checks time out** (107 retries before failing). Dropped the scale animation; opacity-only feedback matches `StudioButton`.
- **Sessions list endpoint schema mismatch.** `/api/sessions` (GET) wasn't returning `classTypeId`/`roomId`/`classType`/`room`, so `sessionsListResponseSchema.parse()` threw and the trainer notes Session select was empty. Filled in the missing fields.
- **`react-native-modal-datetime-picker` rendered nothing on web.** Replaced with a Studio-styled `react-day-picker` calendar + native `<input type="time">` inside an `AppSheet`. Native iOS/Android keep the existing modal flow. Source split across `date-time-picker.tsx`, `date-time-picker-web.tsx`, `date-time-picker-web.native.tsx`, and `date-time-picker-web.css`.
- **`updateClientMutation` was passing `clientProfile.id` where the API expects `user.id`.** The destructive deactivate flow never persisted before. Patched the call site in `(admin)/clients.tsx`.
- **Shared `.env` overrode the test cron token.** The `playwright.config.ts` webServer command now pins `API_ADMIN_BOOTSTRAP_TOKEN=test-admin-bootstrap-token` and bumps `NODE_OPTIONS=--max-old-space-size=8192` (without this Metro OOMs partway through the full suite).

### Specs by file (passing / skipped)

| File | Pass | Skip | Coverage |
|---|---:|---:|---|
| `auth-smoke.spec.ts` | 4 | 0 | Admin/trainer/client sign-in + wrong password. |
| `auth-extended.spec.ts` | 7 | 0 | Sign-out, invite create + redeem (happy / expired / used), password reset request + expired. |
| `client.spec.ts` | 12 | 0 | Home, calendar, book + cancel before/after cutoff, full session → waitlist button, notifications, language switch, sign-out, no-package filter. |
| `trainer.spec.ts` | 11 | 1 | Schedule scoping, clients-list scoping, note create / edit / delete, by-client + by-session filters, search, 403 for unlinked client, non-linked client profile blocked. Skipped: 51 (no post-cron attendance markers — needs new API surface). |
| `admin.spec.ts` | 28 | 0 | Catalog CRUD (ClassType / PackageType / Room create + edit + delete), single-session create / edit / cancel, recurring series create / edit single occurrence / edit whole series / cancel single / delete whole, room + trainer double-book conflicts, invite, client list status badges, pause, deactivate, all four billing flows. |
| `cron-reports-en.spec.ts` | 9 | 0 | Reports sections render, cron consumption (consume / skip pre-cutoff / 401 without token), 4 EN-smoke. |
| `datetime-picker-smoke.spec.ts` | 1 | 0 | Verifies the new web DateTimePicker mounts the calendar + time input and round-trips a date. |
| **Total** | **72** | **1** | |

### Skipped specs and why

The remaining skip is blocked by missing API surface, not by the test layer.

- **Spec 51 — trainer schedule shows post-cron attendance markers.** No endpoint surfaces per-booking `SessionConsumption` or cancellation state on past sessions. Adding this would require a new API surface (e.g., extending `/api/sessions` to include per-session attendance counts, or a dedicated `/api/trainer/attendance` endpoint).

### How to run

```sh
cd apps/mobile
pnpm test:e2e                  # full suite, ~5 minutes
pnpm test:e2e -g "53:"         # one spec by name fragment
pnpm test:e2e --reporter=list  # streaming progress
```

The suite starts its own Expo web server on port 8010 (see `playwright.config.ts`'s `webServer` block). Each spec file's `beforeAll` re-applies the rich seed via `scripts/test/seed-e2e.ts`. The test DB is `postgresql://postgres:postgres@localhost:5434/baza_app?schema=public`.

### Phase A E2E artifacts in tree

- `apps/mobile/playwright.config.ts` — webServer + Chromium project + per-spec retain-on-failure traces.
- `apps/mobile/test/e2e/*.spec.ts` — seven spec files covering the test plan.
- `apps/mobile/test/e2e/helpers/db.ts` — Prisma-direct helpers for seeding state the rich seed doesn't cover (invites, reset tokens, trainer-client linkage, future sessions, fillers, waitlist, etc.).
- `apps/mobile/test/e2e/helpers/locales.ts` — `t` / `t_en` re-exports of the locale JSON for translation-key selectors.
- `apps/mobile/scripts/test/seed-e2e.ts` — rich seed (Q12 matrix).
- testIDs wired across the auth, admin, trainer, and client screens to support the suite. Convention: `<context>-<element>` (e.g. `client-row-${id}`, `package-create-submit`). Components that needed it (`Button`, `Select`, `Input`, `ConfirmSheet`, `SessionCard`, `SegmentedControl`, `MetricRow`, `ErrorState`, `DateTimePicker`) accept and forward a `testID` prop.

## Out of scope for Phase A

- Maestro native parity — Phase B follow-up.
- UI integration layer (formerly `jest.ui.config.ts`) — dropped per Q30; component sanity covered implicitly by E2E.
- Zod schema unit tests — dropped (user feedback).
- Soft delete, trainer specialty, payment-processor v2 — not test-plan concerns.
- CI integration — local-only for now per user direction.

## Time budget (measured)

Local runtimes:
- Unit: <10s
- Integration: ~3-5 min
- Playwright E2E (serial, 71 tests): ~5 min
- Phase A + Phase 2 full local: ~10 min, practical pre-merge

## Execution notes for the next session

1. Confirm `package-class-scoping` is merged to `dev` and `tests` is at `dev` HEAD or later.
2. **Schema setup uses migrations only.** `pnpm exec prisma migrate deploy` (test DB) or `prisma migrate dev --name <x>` (when authoring schema changes). **Never** `prisma db push` — see `~/.claude/projects/.../memory/feedback_prisma_migrations.md`. The current test infra scripts in `package.json` (`test:db:prepare`) used `db push --force-reset` — **rewrite them to use `prisma migrate reset` or `prisma migrate deploy`** as part of Phase A.
3. Create `apps/mobile/scripts/test/seed-e2e.ts` (it doesn't exist yet — the production seed at `scripts/seed.ts` is the closest reference). Implement the **rich seed** shape from this plan (Q12 matrix).
4. Wire per-spec-file DB reset (Q2(b)) — each Playwright spec resets via `prisma migrate reset --skip-seed` then runs the rich seed. Vitest integration tests follow the same pattern (already partially in place — `setup-db.ts` truncates tables; rewrite to use `migrate reset` for stronger isolation).
5. Build out test layers in order: unit → integration → E2E. Each layer's failures inform the next.
6. Use `superpowers:test-driven-development` for each test before implementation/test scaffolding.

---

## Maestro setup — preserved from prior work for Phase B

Maestro setup was hard-won. The original `tests` branch worked through several pitfalls before reaching a runnable state. Phase A defers Maestro entirely, but Phase B will need this. **A backup of the working Maestro flows + scripts is at `/tmp/baza-tests-snapshot/` (outside git, transient — copy back before reboot).** The original files also exist in git history of the pre-reset `tests` branch (look for commits `974188f`, `f5a4bec`, `22dadfa`).

### Architecture overview

Maestro tests run against a **release build** of the native app on a real simulator/emulator, talking to the Expo dev web server (port 8010) which serves the API routes. There is **no separate API process** — Expo's web export hosts both the JS bundle and the `/api/*` handlers.

### Files & locations

```
apps/mobile/.maestro/
├── config.yaml                  # appId + E2E env vars (admin/trainer/client creds)
├── helpers/
│   ├── sign-in.yaml             # reusable sign-in subflow (uses ${EMAIL} / ${PASSWORD})
│   ├── sign-out.yaml            # reusable sign-out (uses ${SIGN_OUT_TAB})
│   └── dismiss-error.yaml       # taps "Retry" on Reanimated PortalDispatchContext crash
├── auth-admin.yaml              # 9 flows total covering auth/admin/trainer/client/password reset
├── auth-trainer.yaml
├── auth-client.yaml
├── admin-create-session.yaml
├── admin-invite-client.yaml
├── client-calendar.yaml
├── client-notifications.yaml
├── trainer-notes.yaml
├── password-reset-request.yaml  # split into two flows: request-token + use-token
└── password-reset.yaml
```

```
apps/mobile/scripts/test/
├── build-e2e.sh                 # one-time native build (iOS xcodebuild OR Android gradle)
├── run-e2e.sh                   # full pre-flight + Maestro run (per-platform)
├── seed-e2e.ts                  # seeds e2e users + a default PackageType (Phase A rewrites this)
├── patch-test-db.ts             # post-prisma-push patches (e.g. extension installs)
└── get-latest-reset-token.ts    # reads the latest reset token from DB for password-reset flow
```

```
apps/mobile/.env.test            # E2E_ADMIN_EMAIL/_PASSWORD, _TRAINER_*, _CLIENT_*,
                                 # RESEND/EXPO/ADMIN_BOOTSTRAP tokens,
                                 # INVITE_TOKEN_TTL_HOURS=48, RESET_TOKEN_TTL_MINUTES=30
```

### Build flow (`scripts/test/build-e2e.sh`)

The build is **separate from the test run** because it's slow (~3-5 min iOS, longer for Android) and rarely changes. Run once after pulling, re-run only when native code changes.

**iOS:**
1. `pnpm exec expo prebuild --clean` — generates `ios/` from `app.json`. Fresh every build.
2. Writes `ios/.xcode.env.local` so Xcode's bundle phase bakes the E2E env vars (`EXPO_PUBLIC_API_URL`, `APP_WEB_URL`, `BASE_URL`) into the release JS bundle. **This is critical** — without it the bundled JS hits whatever was the default at bundle time, not localhost.
3. `xcodebuild -workspace BazaPilates.xcworkspace -scheme BazaPilates -configuration Release -sdk iphonesimulator -derivedDataPath build`.
4. Verifies `main.jsbundle` exists in the output `.app` bundle.

**Android:**
1. Same `expo prebuild --clean`.
2. Patches `AndroidManifest.xml` to add `android:usesCleartextTraffic="true"` — required because the emulator hits the host API over `adb reverse` + plain HTTP, not HTTPS. Done **per-build** by the script (a python heredoc), so the change doesn't pollute the source tree.
3. `cd android && ./gradlew assembleRelease`. Outputs `android/app/build/outputs/apk/release/app-release.apk`.

`NODE_OPTIONS="--max-old-space-size=8192"` is exported because Metro's release bundler OOMs on default heap.

### Run flow (`scripts/test/run-e2e.sh ios|android [flow.yaml]`)

This is the meat — it orchestrates DB prep, API server, simulator/emulator, app install, and Maestro execution.

1. **`pnpm test:e2e:prepare`** — runs `prisma db push --force-reset`, then `patch-test-db.ts`, then `seed-e2e.ts`. Fresh DB every run.
2. **API server: reuse-or-start.** `curl /api/health` to detect; if absent, `CI=1 expo start --web --port 8010` in background. Trap on EXIT kills it. **Pitfall:** the password-reset flow needs a DB-fresh state, so the script force-restarts the API server only for that specific flow (`FORCE_API_SERVER_RESTART=true`).
3. **iOS install:** `xcrun simctl boot "iPhone 16"` (idempotent), `simctl install booted <APP_PATH>`, warm-launch + terminate so first-run JIT doesn't race Maestro's first interactions. **Pitfall:** without the warm launch, the first action timed out waiting for hydration.
4. **Android install:** boots the AVD if not running (default `Pixel_3a_API_34_extension_level_7_arm64-v8a`), waits for `boot_completed=1` via `adb shell getprop`, **also waits for `pm list packages`** (separate from boot — package manager comes up later), then `adb reverse tcp:8010 tcp:8010` so the emulator's localhost reaches the host's API server, then `adb install -r`. **Pitfall:** if package manager is unhealthy, reboots and retries once.
5. **Maestro test:**
   - Single flow: `maestro test --platform $PLATFORM .maestro/$FLOW`.
   - All flows: `maestro test --platform $PLATFORM .maestro/`.
   - Password reset is special: split into two flows. First runs `password-reset-request.yaml` to *trigger* a reset email (which writes a token to DB). Then `get-latest-reset-token.ts` reads that token. Then `password-reset.yaml` runs with `-e RESET_TOKEN=<captured>` to consume it. **Pitfall:** Maestro can't peek at the DB; you must externalise the token-extraction step.

### Common pitfalls encountered (to avoid in Phase B)

1. **Reanimated v4 crash on launch — "PortalDispatchContext" undefined.** Causes a red-screen "Retry" UI. Mitigation: every flow that does `launchApp` runs `helpers/dismiss-error.yaml` conditionally on retry text being visible. **The deeper fix is a Reanimated config thing in `babel.config.js` / `metro.config.js` — verify those configs are stable on the merged `dev` before relying on the helper.**
2. **Detox was incompatible with RN New Architecture + Reanimated v4.** Already removed (commit `7916d11`). Maestro was chosen as the replacement specifically because it works against release builds without instrumentation.
3. **Bundled env vars vs runtime env vars.** `EXPO_PUBLIC_*` is read at *bundle time*, not at runtime. The Xcode build phase needs the env vars exported via `ios/.xcode.env.local` or the release JS will have the wrong API URL baked in.
4. **iOS sim "first launch" race.** Warm-launch + terminate the app before Maestro starts so JIT/precompile is done.
5. **Android cleartext.** `usesCleartextTraffic="true"` must be set or emulator HTTP requests to `localhost:8010` are silently dropped.
6. **Android `pm list packages` race.** Boot completion is not the same as package manager readiness. Both must be polled.
7. **Test IDs everywhere on auth + key actions.** All flows rely on testIDs (`auth-email-input`, `auth-password-input`, `auth-submit-button`, `tab-index`, `tab-settings`, `sign-out-button`, `password-reset-token-input`, etc.). The Phase A Playwright work should preserve / extend these so Phase B Maestro flows can reuse the same selectors.
8. **State clearing.** `clearState: true, clearKeychain: true` on `launchApp` is mandatory for cross-flow isolation — otherwise prior session cookies leak.
9. **Animation timing.** `waitForAnimationToEnd` after every navigation, plus `extendedWaitUntil` with explicit timeouts (15s) for hydration-bound elements.

### Phase B execution prompts

When dispatching Phase B Maestro work in a future session, the agent's brief should include:

- "Restore from snapshot at `/tmp/baza-tests-snapshot/` if present, OR recover from git history of the original `tests` branch — look for commits `974188f` (test infra), `f5a4bec` (Maestro flows), `22dadfa` (Maestro scripts)."
- "Update `seed-e2e.ts` to produce the **rich seed** described in this plan (the matrix from Q12), not the minimal three-user seed it had originally."
- "Mirror Phase A's Playwright tests one-for-one as Maestro flows, reusing the existing `helpers/sign-in.yaml` / `helpers/sign-out.yaml` patterns."
- "Verify the Reanimated 'PortalDispatchContext' crash is gone before adding new flows — if `dev`'s Reanimated config no longer triggers it, the `dismiss-error.yaml` retry helper can be removed from new flows."
- "Always run `build-e2e.sh` before `run-e2e.sh` after a fresh checkout — there's no auto-rebuild."

### `.env.test` template (for reference)

```
APP_WEB_URL=http://127.0.0.1:8010
BASE_URL=http://127.0.0.1:8010
EXPO_PUBLIC_API_URL=http://127.0.0.1:8010
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/baza_app?schema=public
APP_ID_IOS=com.baza.pilates
APP_ID_ANDROID=com.baza.pilates
E2E_ADMIN_EMAIL=admin.e2e@example.test
E2E_ADMIN_PASSWORD=Password123!
E2E_TRAINER_EMAIL=trainer.e2e@example.test
E2E_TRAINER_PASSWORD=Password123!
E2E_CLIENT_EMAIL=client.e2e@example.test
E2E_CLIENT_PASSWORD=Password123!
E2E_CLIENT_RESET_PASSWORD=Password123!Reset1
E2E_RESET_TOKEN_FILE=.maestro/.tmp/password-reset-token.json
RESEND_API_KEY=test-resend-key
RESEND_FROM_EMAIL=Baza Tests <no-reply@example.test>
EXPO_ACCESS_TOKEN=test-access-token
API_ADMIN_BOOTSTRAP_TOKEN=test-admin-bootstrap-token
INVITE_TOKEN_TTL_HOURS=48
RESET_TOKEN_TTL_MINUTES=30
```
