# Baza Pilates — Test Plan (Phase A + Phase 2)

This plan is the output of a structured grilling session that locked in 32 decisions about test scope, framework, seed shape, and merge ordering. It is the source of truth for the test rewrite work on the `tests` branch.

**Phase A deliverable** (landed): ~220 unit + integration tests on the `tests` branch.
**Phase 2 deliverable** (landed): 73 Playwright web E2E tests, 0 skipped.
**Phase B deliverable** (landed): Maestro native E2E — 11/11 flows on iOS (iPhone 17), 15/15 on Android (Pixel_10_Pro emulator).

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

**73 specs passing, 0 skipped, 0 failing.** Full E2E suite runs in ~5 minutes locally.

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
| `trainer.spec.ts` | 12 | 0 | Schedule scoping, clients-list scoping, note create / edit / delete, by-client + by-session filters, search, 403 for unlinked client, non-linked client profile blocked, post-cron attendance markers on past sessions. |
| `admin.spec.ts` | 28 | 0 | Catalog CRUD (ClassType / PackageType / Room create + edit + delete), single-session create / edit / cancel, recurring series create / edit single occurrence / edit whole series / cancel single / delete whole, room + trainer double-book conflicts, invite, client list status badges, pause, deactivate, all four billing flows. |
| `cron-reports-en.spec.ts` | 9 | 0 | Reports sections render, cron consumption (consume / skip pre-cutoff / 401 without token), 4 EN-smoke. |
| `datetime-picker-smoke.spec.ts` | 1 | 0 | Verifies the new web DateTimePicker mounts the calendar + time input and round-trips a date. |
| **Total** | **73** | **0** | |

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
- `apps/mobile/test/e2e/helpers/dates.ts` — deterministic `nextReformerDayKey()` and `navigateWeekStripTo(page, dateKey)` so specs that pick a session date from the DB don't get stuck on a WeekStrip that doesn't show that week. Replaces the racy `d.getTime() === Date.now()` loop that lived inline in admin/cron specs.
- `apps/mobile/scripts/test/seed-e2e.ts` — rich seed (Q12 matrix).
- testIDs wired across the auth, admin, trainer, and client screens to support the suite. Convention: `<context>-<element>` (e.g. `client-row-${id}`, `package-create-submit`). Components that needed it (`Button`, `Select`, `Input`, `ConfirmSheet`, `SessionCard`, `SegmentedControl`, `MetricRow`, `ErrorState`, `DateTimePicker`) accept and forward a `testID` prop.

### Known fragility — anchor-time follow-up

The whole suite depends on the **wall clock**: the seed creates 2 weeks of recurring sessions starting from "today's locale week", the API filters `gt: new Date()`, helpers like `findFutureSeriesSession` filter on real `now`, and many specs compute target dates from `new Date()`. This works today but drifts over time:

- **Day-of-week sensitivity**: today is Wed → Reformer Mon/Wed/Fri 10:00 means several sessions exist in the "current visible week"; on Saturday the visible week has zero past+today Reformer sessions and several specs would have nothing to click.
- **Time-of-day sensitivity**: at seed time, the seeder skips sessions whose `startsAt` is already past. Running at 09:00 vs 11:00 produces different session sets.
- **Cross-spec state mutation**: specs that cancel a session (e.g. spec 23) push downstream specs' "next future Reformer session" into a later week, which is why specs 25-28 needed `navigateWeekStripTo()` to page the WeekStrip.

**Anchor-time refactor (planned)**: pin the entire test stack to a fixed instant per spec. Concretely:
1. Pick anchor (e.g. `2026-05-06T09:00:00Z` — a Wednesday, before the seed's 10:00 sessions).
2. Add `apps/mobile/lib/server/clock.ts` exporting a `now()` provider that reads `E2E_NOW` env var when set, else `new Date()`. Wire every server-side `new Date()` / `Date.now()` (currently 155+ callsites — `app/api/**/*.ts`, `lib/server/**/*.ts`) through it.
3. Same for the seed (`scripts/test/seed-e2e.ts`) and spec helpers (`test/e2e/helpers/db.ts`).
4. In the Playwright `webServer.command`, set `E2E_NOW=<anchor>`.
5. In `playwright.config.ts` `use.timezoneId` and a `beforeEach` `page.clock.setFixedTime(anchor)` to freeze the BROWSER's `Date` in sync with the server.
6. Spec test code uses a `getNow()` helper instead of `new Date()`.

Doing this lets us run the suite in CI tomorrow / next week / a year from now and get identical seeds + identical results. Tracked separately because the audit + wiring across 155 callsites is multi-hour work and benefits from being its own focused PR.

## Phase B status (Maestro native parity)

**iOS: 11/11 flows passing on iPhone 17 (~8 min). Android: 15/15 flows passing on Pixel_10_Pro emulator (~16 min).** Each flow runs against a **release build** of the app, talking to the same Expo dev server (port 8010) that the Playwright suite uses, hitting the same `5434/baza_app` test DB.

The original Phase B groundwork from commits `974188f` / `f5a4bec` / `22dadfa` survived only as dangling git objects (the originating branches were reset). Recovery used `git show <sha>:<path>` per file, then adapted each to the Phase A app: rich-seed users, current testIDs, Phase A's edit/delete UI, and the platform-specific bundle IDs (`com.steva.borus.baza-pilates` iOS, `com.steva.borus.bazapilates` Android).

### Scope: iOS skips in-sheet content; Android exercises it fully

The current bottom-sheet implementation (gorhom `BottomSheetModal` via `components/ui/sheet.tsx`) renders content in a portal layer. **iOS XCUITest cannot traverse this portal** even with `snapshotKeyHonorModalViews: true` set in the workspace config — text and testIDs inside an open `<AppSheet>` are visible on screen but invisible to Maestro's view-hierarchy reader. **Android UiAutomator can traverse it.**

This produces a deliberate split:
- **iOS flows** verify the path up to and including the sheet trigger (navigate → trigger button reachable → tap opens sheet). Inside-sheet behavior is covered by Phase A Playwright web-E2E.
- **Android-only flows** (file prefix `android-`) exercise the full create→edit→delete cycle inside open sheets — ClassType / Room / PackageType / trainer-note. These run on Android only; the runner's bulk loop skips `android-*` files when `PLATFORM=ios`.

### Specs by flow

#### iOS (11 flows, ~8 min)

| File | Pass | Skip | Coverage |
|---|---:|---:|---|
| `auth-admin.yaml` | 1 | 0 | Admin sign-in lands on dashboard. |
| `auth-trainer.yaml` | 1 | 0 | Trainer sign-in lands on schedule. |
| `auth-client.yaml` | 1 | 0 | Client sign-in lands on home. |
| `admin-create-session.yaml` | 1 | 0 | Reach the new-session trigger on the admin dashboard. |
| `admin-invite-client.yaml` | 1 | 0 | Switch to Invites segment, reach the new-invite trigger. |
| `client-calendar.yaml` | 1 | 0 | Navigate to client calendar. |
| `client-notifications.yaml` | 1 | 0 | Navigate to client notifications screen. |
| `trainer-notes.yaml` | 1 | 0 | Navigate to notes tab, reach the new-note trigger. |
| `trainer-per-client-profile.yaml` | 1 | 0 | Tap a linked client row → per-client profile renders. |
| `trainer-post-cron-attendance.yaml` | 1 | 0 | Past attended session card renders on yesterday's day. |
| `password-reset-request.yaml` + `password-reset.yaml` | 1 | 0 | Request token (captured via `E2E_RESET_TOKEN_FILE`) → reset screen accepts the captured token. (Stops at token entry; new-password submit hits an iOS autofill quirk — see "Known issues".) |
| **Total** | **11** | **0** | |

#### Android (15 flows, ~16 min)

The 11 iOS-parity flows above plus 4 Android-only CRUD flows that exercise content inside open `<AppSheet>` portals (which XCUITest can't reach). Android also runs the password-reset flow's full new-password → submit → "Lozinka ažurirana" cycle (gated by `runFlow when: platform: android`).

| File | Pass | Skip | Coverage |
|---|---:|---:|---|
| The 11 iOS flows above | 11 | 0 | Same as iOS, with platform-gated `hideKeyboard` to dismiss the soft keyboard before submit-button taps. Password-reset additionally completes the new-password submit cycle. |
| `android-admin-class-type-crud.yaml` | 1 | 0 | Create → edit → delete a ClassType, all inside the bottom-sheet form. |
| `android-admin-room-crud.yaml` | 1 | 0 | Create → edit → delete a StudioRoom, all inside the bottom-sheet form. |
| `android-admin-package-type-crud.yaml` | 1 | 0 | Create → edit → delete a PackageType, including the `package-class-type-select` ClassType picker. |
| `android-trainer-note-edit-delete.yaml` | 1 | 0 | Create → edit → delete a trainer note (uses regex `id:` matching for session/client option testIDs). Reuses the trainer↔client link setup from `trainer-per-client-profile.yaml`. |
| **Total** | **15** | **0** | |

### Cross-platform YAML model

Flow YAMLs are platform-agnostic; per-platform behavior is injected by the runner.

- **`appId: ${APP_ID}`** in every flow + helper. The runner sets `APP_ID` to `IOS_APP_ID` (`com.steva.borus.baza-pilates`) or `ANDROID_APP_ID` (`com.steva.borus.bazapilates`) and passes it via `-e APP_ID=…` on every `maestro test` invocation.
- **Platform-gated steps** use `runFlow when: platform: android` blocks. Examples:
  - `helpers/sign-in.yaml` calls `hideKeyboard` after typing the password (Android soft keyboard hides `auth-submit-button`; iOS `hideKeyboard` errors hard).
  - `password-reset-request.yaml` calls `hideKeyboard` before tapping `reset-send-link-button` (same reason).
  - `password-reset.yaml`'s new-password → submit → "Lozinka ažurirana" cycle runs only on Android (iOS truncates due to `textContentType="newPassword"` autofill).
- **`android-*` file prefix** marks flows whose assertions live entirely inside an open bottom-sheet (XCUITest blind spot). The runner's bulk loop skips them when `PLATFORM != "android"`.

### Resolved infrastructure choices

- **Bundle ID corrected.** Old flows used `com.baza.pilates`; the actual `app.json` ships `com.steva.borus.baza-pilates` (iOS) and `com.steva.borus.bazapilates` (Android). All flows + scripts + `.env.test` updated to match.
- **Bash sources `.env.test` directly.** `dotenv-cli` was assumed by the recovered runner but isn't installed; `set -a; source .env.test; set +a` is functionally equivalent and adds no new dev-dep. Quoting added to `RESEND_FROM_EMAIL` so the email's `<...>` doesn't trigger bash redirection.
- **Migrations, never `db push`.** The recovered runner called `prisma db push --force-reset`. Rewritten to a new `pnpm test:e2e:prepare` script that runs `prisma migrate reset --force` → `patch-test-db.ts` → `seed-e2e.ts`. Matches the project rule (see `~/.claude/projects/.../memory/feedback_prisma_migrations.md`).
- **Per-flow DB reset in bulk runs.** When `run-e2e.sh ios` runs every flow back-to-back, each flow gets a fresh seed before it runs (mirrors Phase A's per-spec-file Playwright reset). Single-flow runs reset once at script start. Failures don't halt the loop — a red/green summary lands at the end.
- **`snapshotKeyHonorModalViews: true` workspace config.** `apps/mobile/.maestro/config.yaml` enables iOS modal traversal in the XCUITest snapshot. Required for the sheet trigger flows to reach the `+` HeaderIconButton (rendered via `ScreenContainerRaw`'s `rightSlot`). Maestro 2.x doesn't auto-load workspace config, so the runner passes `--config .maestro/config.yaml` to every `maestro test` call.
- **`tslib` and `babel-preset-expo` are now direct deps of `apps/mobile`.** Without them, the iOS release bundle phase fails: `metro.config.js` calls `require.resolve('tslib/tslib.es6.mjs')` (workaround for an Expo-web SSR + framer-motion CJS-interop crash) and Metro's transform-worker calls `require('babel-preset-expo')` — both unreachable from `apps/mobile/node_modules` under pnpm hoisting.
- **Sign-out helper rewritten.** Phase A replaced the dedicated tab/button with a global ProfileSheet; the helper now taps `open-profile-sheet` (header avatar) → `profile-sign-out-button`. Currently unused by any flow but left in for future expansion.
- **Dynamic IDs flow through env.** `seed-extension.ts` emits JSON with `sessionId`/`dateKey`; the runner parses it and forwards the values to Maestro via `-e SESSION_ID=... DATE_KEY=...`, so flows can reference IDs that didn't exist when the YAML was written.
- **Reset-token capture wired into `sendResetEmail`.** When `E2E_RESET_TOKEN_FILE` is set, the API writes the raw token to a JSON file alongside sending the email, and `get-latest-reset-token.ts` reads it back during the password-reset run. Vitest integration test (`password-reset-token-capture.test.ts`) asserts the wiring.
- **iOS "Save Password?" dialog dismissed in `sign-in.yaml`.** After the form submits successfully, iOS prompts to save credentials; the helper taps "Not Now" if the dialog appears (no-op on Android).
- **`appId: ${APP_ID}` in every YAML.** iOS bundle ID is hyphenated (`baza-pilates`); the Android package squashes it (`bazapilates`). Hardcoding either broke the cross-platform run. The runner sources `.env.test` (which carries `APP_ID_IOS` / `APP_ID_ANDROID`), picks the right one for the target platform, and forwards it via `-e APP_ID=…` on every `maestro test` invocation.
- **`hideKeyboard` is platform-gated.** On Android, the soft keyboard covers `auth-submit-button` after typing a password (and `reset-send-link-button` after typing the reset email). Calling `hideKeyboard` before the tap fixes it. On iOS, `hideKeyboard` fails hard with "Couldn't hide the keyboard," so the call lives inside `runFlow when: platform: android` blocks.
- **`android-*` file prefix gates Android-only flows.** The bulk-loop in `run-e2e.sh` skips files whose basename starts with `android-` when `PLATFORM != "android"`. The 4 flows that exercise content inside open `<AppSheet>` portals (XCUITest blind spot) carry that prefix.
- **Pixel_10_Pro AVD on Android 17.** The historical default `Pixel_3a_API_34_extension_level_7_arm64-v8a` is no longer present on this machine; `.env.test` overrides `ANDROID_AVD=Pixel_10_Pro`. The Android branch of `build-e2e.sh` defaults `ANDROID_HOME` / `ANDROID_SDK_ROOT` to `~/Library/Android/sdk` if neither is set in the shell, so `gradlew` finds the SDK without a separate `local.properties` file (which `expo prebuild --clean` would clobber every build anyway).
- **Gradle JVM heap raised for D8.** The Android branch of `build-e2e.sh` exports `GRADLE_OPTS="-Xmx6144m -XX:MaxMetaspaceSize=1024m"`. Without this, `mergeExtDexRelease` OOMs partway through bundling Skia + Reanimated + gesture-handler + keyboard-controller + Prisma into one classes.dex.
- **`expo prebuild --clean` wipes both `ios/` and `android/`.** Switching platforms requires rebuilding the target platform's app. The build scripts are idempotent against an empty native dir; just re-run `bash scripts/test/build-e2e.sh ios` or `… android` before `run-e2e.sh`.

### testIDs added during Phase B

These were missing from Phase A (where Playwright could fall back to role/text). All non-load-bearing — pure additions.

- `admin-new-session-button` — `+` HeaderIconButton on admin dashboard.
- `admin-new-class-type-button` — `+` on the ClassTypes screen.
- `admin-new-room-button` — `+` on the Rooms screen.
- `admin-new-package-button` — `+` on the Packages tab.
- `admin-new-client-button`, `admin-new-invite-button` — `+` on the Clients screen (depends on segment).
- `trainer-new-note-button` — `+` on the trainer Notes tab.
- `admin-quick-class-types`, `admin-quick-rooms` — admin dashboard quick-action rows.
- `HeaderIconButton` itself now accepts an optional `testID` prop.

### How to run

```sh
cd apps/mobile
# Build (only when native code changes; expo prebuild --clean wipes the
# other platform's native dir, so switching platforms = rebuild).
bash scripts/test/build-e2e.sh ios        # ~3-5 min
bash scripts/test/build-e2e.sh android    # ~3-5 min (Gradle daemon kept warm, much faster on rebuild)

# Run (full pre-flight + run all flows).
bash scripts/test/run-e2e.sh ios          # iOS:     11 flows  (~8 min on iPhone 17)
bash scripts/test/run-e2e.sh android      # Android: 15 flows  (~16 min on Pixel_10_Pro)

# One flow at a time.
bash scripts/test/run-e2e.sh ios trainer-notes.yaml
bash scripts/test/run-e2e.sh android android-admin-class-type-crud.yaml
```

The runner sources `.env.test`, runs `pnpm test:e2e:prepare`, reuses or starts the API server on 8010, boots `iPhone 17` (override with `IOS_SIMULATOR_NAME`) or `Pixel_10_Pro` (override with `ANDROID_AVD`), warm-launches + terminates the app, then runs Maestro per flow.

### Phase B artifacts in tree

- `apps/mobile/.maestro/` — 11 cross-platform flow YAMLs + 4 Android-only flow YAMLs (`android-*`) + 3 helpers + `config.yaml`.
- `apps/mobile/scripts/test/build-e2e.sh` + `run-e2e.sh` — release build + orchestrator.
- `apps/mobile/scripts/test/patch-test-db.ts` — adds `pgcrypto` extension + UUID/`updatedAt` defaults that the schema doesn't generate.
- `apps/mobile/scripts/test/seed-extension.ts` — CLI bridge that lets the runner trigger `linkTrainerToClient` / `createPastAttendedSession` from `test/e2e/helpers/db.ts` between flows.
- `apps/mobile/scripts/test/get-latest-reset-token.ts` — reads the captured reset token JSON.
- `apps/mobile/lib/server/e2e-reset-token-capture.ts` — capture/read functions; only writes when `E2E_RESET_TOKEN_FILE` is set, no production cost.
- `apps/mobile/test/integration/api/password-reset-token-capture.test.ts` — Vitest integration test asserting the wiring.

### Known issues / follow-ups

- **gorhom-bottom-sheet content invisible to Maestro on iOS only.** XCUITest cannot traverse the portal layer; UiAutomator can. The 4 `android-*` CRUD flows cover the inside-sheet behavior on Android, and Phase A Playwright covers it on web. On iOS the Maestro suite stops at the sheet trigger. To unblock iOS, swap to a `UIPresentationController`-backed sheet primitive.
- **iOS `textContentType="newPassword"` autofill conflict.** On iOS `password-reset.yaml` only goes as far as asserting the captured token in the input; the new-password input + submit cycle hits an iOS strong-password-suggestion that blanks the Maestro-typed value. Android (which ignores `textContentType`) runs the full cycle via a `runFlow when: platform: android` block. Phase A Playwright (`auth-extended.spec.ts`) covers the full cycle on web. To re-enable on iOS in Maestro, drop `textContentType` on the reset PasswordInput in test builds.
- **`<Pressable onPress>` collapses descendants in iOS accessibility.** `trainer-post-cron-attendance.yaml` asserts the SessionCard testID (the wrapper) rather than the inner `1 dolazak` / `1 otkazan` text content. Phase A Playwright spec 51 verifies the inner text directly. Android UiAutomator does not collapse — the same flow works on Android without changes, but the assertion strategy is shared because the wrapper-testID approach is sufficient on both.
- **WeekStrip date assumption.** `trainer-post-cron-attendance.yaml` taps yesterday's day on the WeekStrip directly. With a Monday-start locale week, yesterday is always in the visible week — but a Saturday→Sunday roll could put yesterday in the previous week, requiring `tapOn: { id: "week-strip-prev" }` first. Anchor-time refactor would resolve this on both platforms at once.
- **PortalDispatchContext helper retained.** `helpers/dismiss-error.yaml` is referenced from every flow as a precaution. If a future Reanimated config bump confirms the crash is gone, the `runFlow when:` block can be removed across all flow YAMLs.

## Out of scope for Phase A

- Maestro native parity — landed in Phase B (see "Phase B status" above).
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

## Maestro reference (pitfalls + architecture)

This section is reference for future Maestro work — what the runner is doing under the hood, and the pitfalls that cost real time the first time around. The current Phase B state (counts, file list, how to run) lives in **Phase B status** above.

### Architecture overview

Maestro tests run against a **release build** of the native app on a real simulator/emulator, talking to the Expo dev web server (port 8010) which serves the API routes. There is **no separate API process** — Expo's web export hosts both the JS bundle and the `/api/*` handlers.

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

1. **`pnpm test:e2e:prepare`** — runs `prisma migrate reset --skip-seed --force`, then `patch-test-db.ts`, then `seed-e2e.ts`. Fresh DB every run.
2. **API server: reuse-or-start.** `curl /api/health` to detect; if absent, `CI=1 expo start --web --port 8010` in background. Trap on EXIT kills it. **Pitfall:** the password-reset flow needs a DB-fresh state, so the script force-restarts the API server only for that specific flow (`FORCE_API_SERVER_RESTART=true`).
3. **iOS install:** `xcrun simctl boot "$IOS_SIMULATOR_NAME"` (defaults to `iPhone 17`, idempotent), `simctl install booted <APP_PATH>`, warm-launch + terminate so first-run JIT doesn't race Maestro's first interactions. **Pitfall:** without the warm launch, the first action timed out waiting for hydration.
4. **Android install:** boots the AVD if not running (default `Pixel_3a_API_34_extension_level_7_arm64-v8a`), waits for `boot_completed=1` via `adb shell getprop`, **also waits for `pm list packages`** (separate from boot — package manager comes up later), then `adb reverse tcp:8010 tcp:8010` so the emulator's localhost reaches the host's API server, then `adb install -r`. **Pitfall:** if package manager is unhealthy, reboots and retries once.
5. **Per-flow setup hook.** Some flows need fixtures the rich seed deliberately omits (trainer↔client booking link, past attended session). `apply_flow_setup` in the runner shells out to `scripts/test/seed-extension.ts` to create them, and forwards any IDs it returns to Maestro via `-e`.
6. **Maestro test:**
   - Single flow: `bash scripts/test/run-e2e.sh ios <flow.yaml>`.
   - All flows: `bash scripts/test/run-e2e.sh ios` — iterates flow files alphabetically, re-running `pnpm test:e2e:prepare` between each so DB drift never crosses flows. Skips `config.yaml` and the `password-reset*.yaml` pair (handled separately at the end).
   - Password reset: split into two flows. The first triggers a reset email; `sendResetEmail` honors `E2E_RESET_TOKEN_FILE` and writes the raw token to that JSON file. `get-latest-reset-token.ts` reads it back, and the second flow runs with `-e RESET_TOKEN=<captured>` to consume it. **Pitfall:** Maestro can't peek at the DB; you must externalise the token-extraction step.

### Common pitfalls

1. **Reanimated v4 crash on launch — "PortalDispatchContext" undefined.** Causes a red-screen "Retry" UI. Mitigation: every flow that does `launchApp` runs `helpers/dismiss-error.yaml` conditionally on retry text being visible. The deeper fix is a Reanimated config thing in `babel.config.js` / `metro.config.js` — verify those configs are stable on `dev` before relying on the helper.
2. **Detox was incompatible with RN New Architecture + Reanimated v4.** Already removed (commit `7916d11`). Maestro was chosen as the replacement specifically because it works against release builds without instrumentation.
3. **Bundled env vars vs runtime env vars.** `EXPO_PUBLIC_*` is read at *bundle time*, not at runtime. The Xcode build phase needs the env vars exported via `ios/.xcode.env.local` or the release JS will have the wrong API URL baked in.
4. **iOS sim "first launch" race.** Warm-launch + terminate the app before Maestro starts so JIT/precompile is done.
5. **Android cleartext.** `usesCleartextTraffic="true"` must be set or emulator HTTP requests to `localhost:8010` are silently dropped.
6. **Android `pm list packages` race.** Boot completion is not the same as package manager readiness. Both must be polled.
7. **`tslib` must be a direct dep of `apps/mobile`.** `metro.config.js` calls `require.resolve('tslib/tslib.es6.mjs')` to fix a CJS-interop crash on Expo web SSR. Workspace pnpm hoisting put `tslib` only at the workspace root, which the mobile package can't reach — the iOS release bundle phase fails with `Cannot find module 'tslib/tslib.es6.mjs'`. Adding `tslib` to `apps/mobile/package.json` symlinks it into `apps/mobile/node_modules` and resolves both.
8. **State clearing.** `clearState: true, clearKeychain: true` on `launchApp` is mandatory for cross-flow isolation — otherwise prior session cookies leak.
9. **Animation timing.** `waitForAnimationToEnd` after every navigation, plus `extendedWaitUntil` with explicit timeouts (15s) for hydration-bound elements.
10. **`source .env.test` requires quoted values containing spaces or shell metachars.** `RESEND_FROM_EMAIL=Baza Tests <no-reply@example.test>` triggers bash redirection on `<`. Quote it: `RESEND_FROM_EMAIL="Baza Tests <no-reply@example.test>"`.
