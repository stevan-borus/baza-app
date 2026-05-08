# UI Feedback Log — `fix/ui` branch

Comprehensive log of every item asked for in the multi-session UI feedback round, with final status. Use this in a future session as a canonical reference for what shipped, where, and what's open.

Branch: `fix/ui`. Latest commit: `5f67a24 feat(reports): per-Sala utilization drilldown`. Pushed to origin.

---

## Final test status

- Unit: **36 / 36** passing
- Integration: **204 / 204** passing
- E2E (Playwright): **73 / 73** passing
- Type-check: clean

---

## Login credentials (rich seed)

- **Admin**: `admin.e2e@example.test` / `Password123!`
- **Trainer (Reformer)**: `trainer.reformer@e2e.test` / `Password123!`
- **Client (active Reformer)**: `client.active.reformer@e2e.test` / `Password123!`

Defined in `apps/mobile/scripts/test/seed-e2e.ts`. Note: `pnpm test:integration` and `pnpm test:e2e:prepare` both wipe the DB and re-apply the seed; if login breaks, run `pnpm --filter mobile test:db:seed-e2e`.

---

## Commit history on `fix/ui`

```
5f67a24 feat(reports): per-Sala utilization drilldown
9d97f12 feat(admin): tap session card → detail page (final design)
4465e27 fix(admin): UI feedback round 3 — tab bar, billing filters, slash time, comp card
29c93fb fix(e2e): clear remaining 3 failures from test plan (#9)         ← merged from PR #9
c79a623 fix(e2e): repair test plan failures after Phase B-3 + anchor-time merge
f27df1b test(seed): paid clients (Flow 1) + bookings on upcoming sessions
f6a67e4 feat(admin): session detail page + slide+fade card animation + loading skeletons
a9037c2 feat(admin): UI feedback round 2 — Aktivne dodele page, Naplata client filter, polish
00821be Merge remote-tracking branch 'origin/dev' into fix/ui
7c2f0f3 feat(reports): Paketi insights section + BillingRecord package link
d9f2228 fix(admin): UI feedback round 1 — bug fixes + billing client filter
752e293 refactor(test): pin entire test stack to a single anchor instant (#8)  ← merged from PR #8
```

---

## All tasks (37 total) — final status

### Phase A: bugs

- [x] **#7** i18n key collision `admin.clients.assignPackage` (string at line 319, object at line 367, in both `sr.json` + `en.json`). Renamed nested key to `compPackageHeading`. Added `test/unit/i18n-no-duplicate-keys.test.ts` to scan raw JSON for duplicates at any depth.
- [x] **#9** "komp paket" → "Poklon paket" / "Complimentary package".
- [x] **#4** Sala → Max klijenata refresh bug. Extracted `applySessionFormChange` helper in `apps/mobile/lib/admin/session-form-state.ts`. 5 unit tests cover coupling rules. Wired into create + edit + series sheets.
- [x] **#17** API rejects `visibleToClients=false` when bookings exist. Confirmed already shipped in a prior commit.

### Phase B: domain features

- [x] **Naplata `?clientUserId=` filter API** + 3 integration tests in `billing-client-filter.test.ts`.
- [x] **#16** Izveštaji Paketi insights section: new endpoint `GET /api/reports/packages` (most-used, revenue per type, comp vs paid). 4 integration tests in `reports-packages.test.ts`. Comp-vs-paid card later removed in #36 per user feedback.
- [x] **BillingRecord schema link**: added nullable `packageTypeId String?` FK to `PackageType` (ON DELETE SET NULL). Migration `20260507182120_billing_record_package_link`.
- [x] **#11** Aktivne dodele standalone page at `/admin/packages/active-assignments` with per-client server-side `?search=` and status filter chips. Client name as primary line on each card. 3 integration tests.
- [x] **#12** Naplata per-client filter UI wired to the existing API filter.

### Phase C: visual polish (round 1)

- [x] **#1** StatStrip column centering fix (fixed-height label slot + min height + space-between).
- [x] **#2** Removed colored dot from `Tipovi treninga` (ClassType list).
- [x] **#3** Removed map-pin icon from `Sale` (rooms) list.
- [x] **#5** Session card time → diagonal stack. Superseded by **#34** (slash design).
- [x] **#8** Razlog → 3-line textarea.
- [x] **#10** Border radius mismatch fixed: Select dropdown radius aligned to Input's `rounded-lg`.
- [x] **#13** Rezervacije empty-state guard: chart now uses `bookingsData.some(d => d.y > 0)` so all-zero series renders the EmptyState rather than an empty accent card.
- [x] **#14** Iskorišćenost label fix via `formatBucketLabel` helper (e.g. "Maj 2026" instead of "2026-05"). Per-Sala drilldown initially deferred → shipped as **#23**.

### Phase B-3: session detail + animation

- [x] **#15** Session detail page at `/admin/sessions/[id]` with header (date · time · trainer · room · capacity), pencil icon, booked-clients list (avatar/name/email/chevron). New GET handler on `/api/sessions/[id]`. 2 integration tests. Slide+fade animation on day-view cards (translateX direction tied to date direction; staggered ≤30ms × min(idx, 8); re-keyed on `${selectedDate}-id`).

### Phase D: loading states

- [x] **#6** Loading skeletons on initial isLoading for: admin/clients, admin/billing, admin/class-types, admin/rooms, admin/packages, trainer/clients. (admin/sessions/[id] and packages/active-assignments shipped with skeletons inline.)

### Phase E: seed and infra

- [x] **#18** Rich seed: paid clients via Flow 1 (BillingRecord paired with ClientPackage). `paused` stays Flow 2 to preserve comp coverage.
- [x] **#19** Seeded bookings on upcoming sessions (second matching session, so e2e `book a session` test still finds an empty seat).
- [x] **#20** E2E client books a session (existing test #55 in `client.spec.ts`).
- [x] **#21** Booking constraints integration coverage (existing `bookings-class-scoping.test.ts` + `bookings-cancel.test.ts` + `cron-sessions-consumption.test.ts`).
- [x] **#22** Anchor-time refactor (PR #8, separate worktree). Anchor = `2026-05-11T09:00:00Z` (Monday morning), revised from Saturday during e2e debugging. Pinned by `TEST_ANCHOR_TIME` env var; helper `apps/mobile/lib/now.ts`.

### Round 2 regressions (after Metro cache clear)

- [x] **#25** Session card time wide range — superseded by **#34**.
- [x] **#26** Session detail page reachable — superseded by **#37** (detail page is now primary tap target).
- [x] **#27** Aktivne dodele cards: client name primary — verified working post-cache-clear.
- [x] **#28** Naplata double scroller: removed virtualized `LegendList` (which had `height: 400`), replaced with plain `.map`, infinite-scroll wired to outer ScrollView's `onScroll`.
- [x] **#29** Naplata month chevrons now filter records: extended `GET /api/billing` with `?from=` + `?to=`; UI sends `selectedMonth.startOf/endOf("month")`.
- [x] **#30** Mesečni prihod card layout: rank number `rgba(255,255,255,0.12)` was invisible on bone background; switched to `tokens.muted` at 35% opacity, bar bg to `tokens.glassStrong`.
- [x] **#31** Izveštaji period pills now produce different data: each pill (week/month/quarter) derives a from/to window (7/30/90 days) plus its bucket granularity (day/week/month).
- [x] **#32** Stat grid 2x2 numbers centered — resolved after Metro cache clear; user confirmed.

### Round 3 (after looking at running app)

- [x] **#33** Hidden `(admin)/packages/active-assignments` and `(admin)/sessions/[id]` from the bottom tab bar via `<Tabs.Screen href={null}>`. Expo Router auto-registers nested files in tab groups; fix uses the same pattern as `class-types` and `rooms` already in `_layout.tsx`.
- [x] **#34** Session card time → editorial slash format (`HH:mm / HH:mm` with oversized -12deg skewed accent slash). Replaced the diagonal stack from #25.
- [x] **#35** Naplata client filter "error" — root cause was `<ErrorState>` and `<EmptyState>` rendering simultaneously when query errored; gated empty state on `!isError`. Defensive null-checks added in API where-clause builder.
- [x] **#36** Removed "Plaćeni nasuprot poklon" card from Izveštaji per user feedback. API endpoint and `compVsPaid` field kept for data availability.
- [x] **#37** Tap session card → detail page first (final design). After PR #9 merged, `handleEventPress` now navigates to `/admin/sessions/[id]`; the detail-page pencil pushes back with `?editSessionId&focusDate` so the edit sheet opens on the dashboard. Removed redundant `0/X zakazano · Sala · Č. lista` top card from edit sheet (info lives on detail page header). Removed redundant "View N bookings →" link. Updated `openSessionEditSheet` e2e helper. Fixed test 24 stability (`.click()` → `.dispatchEvent("click")` for Tamagui-Pressable buttons that aren't stable during MotiView animation).

### Infrastructure

- [x] **#24** Subagent-fixed e2e failures: PR #9. Root causes: admin 26/28 — seed bookings caused PATCH/DELETE to 409, test's `waitForResponse(r.status() < 300)` never matched; fix cancels bookings via `cancelBookingsOnRecurringSchedule` DB helper before save. Trainer 51 — Sun 5/10 was off the visible week post anchor change; routed click through `navigateWeekStripTo`.

### Round 4 (this session, follow-ups)

- [x] **#23** Per-Sala utilization drilldown shipped. New endpoint `GET /api/reports/utilization/by-room` accepts the same `?from=&to=&period=` query params as `/utilization` but groups by `roomId` instead of by time bucket. Returns `{ roomId, roomName, totalCapacity, totalBooked, utilization }` per row, sorted by utilization desc (busiest first). 3 integration tests in `reports-utilization-by-room.test.ts`. UI: a "Po sali" / "By room" sub-section under Iskorišćenost kapaciteta on Izveštaji, with one smaller GlassCard (44px ring) per Sala. Always shown when data exists, no toggle.

---

## Domain language captured in CONTEXT.md

- **Naplata** (section name) — admin-facing list of past payments, plus the entry point for **Nova uplata**.
- **Nova uplata** (Flow 1) — sr "Nova uplata" / en "New payment". Default assignment path: BillingRecord + ClientPackage created atomically.
- **Poklon paket** (Flow 2) — sr "Poklon paket" / en "Complimentary package". Free assignment for family/friends, no BillingRecord. Replaces the old "komp paket" label.
- **BillingRecord.packageTypeId** — nullable FK linking a payment to the PackageType it bought (non-null on Flow 1 going forward).
- **Anchor time** — `TEST_ANCHOR_TIME` env var; default `2026-05-11T09:00:00Z`.

---

## Files added in this session

```
apps/mobile/lib/admin/session-form-state.ts
apps/mobile/app/(admin)/sessions/[id].tsx
apps/mobile/app/(admin)/packages/active-assignments.tsx
apps/mobile/app/api/reports/packages/+api.ts
apps/mobile/app/api/reports/utilization/by-room/+api.ts
apps/mobile/prisma/migrations/20260507182120_billing_record_package_link/migration.sql
apps/mobile/test/unit/i18n-no-duplicate-keys.test.ts
apps/mobile/test/unit/session-form-coupling.test.ts
apps/mobile/test/integration/billing-client-filter.test.ts
apps/mobile/test/integration/client-packages-admin-list.test.ts
apps/mobile/test/integration/reports-packages.test.ts
apps/mobile/test/integration/reports-utilization-by-room.test.ts
apps/mobile/test/integration/sessions-by-id-get.test.ts
UI_FEEDBACK_LOG.md
```

---

## Round 5 (after running app on iPhone 17 sim)

Issues raised after walking the running app:

### Routing
- [x] **#38** Tab bar still showed `packages…/sessions/…` entries despite `<Tabs.Screen href={null}>`. Root cause: Expo Router was registering each top-level file as a tab; the `href: null` on `name="packages/active-assignments"` (with a slash) didn't take because the screen registration is keyed on the *folder* not the slashed name. Fix: convert the two leaking tabs into folder-tabs, mirroring the working `(trainer)/clients/` pattern.
  - `(admin)/packages.tsx` → `(admin)/packages/index.tsx`, plus `(admin)/packages/_layout.tsx` (Stack). `active-assignments.tsx` already lived in the folder; the new layout makes Paketi a single tab with `active-assignments` as a nested stack route.
  - `(admin)/sessions/` becomes a folder-tab too: `(admin)/sessions/_layout.tsx` (Stack) + `(admin)/sessions/[id].tsx`. The session-detail route is the only screen in the stack; the tab itself is hidden via `<Tabs.Screen name="sessions" href={null} />` so it never shows in the bar but the nested route is still pushable from the dashboard via `router.push("/(admin)/sessions/${id}")`.
  - The Pregled tab keeps its flat `index.tsx` — turning it into an `index/` folder breaks Expo Router's route collapsing (URL becomes `/(admin)/index` rather than `/(admin)`), so the simpler approach was to leave the dashboard flat and only nest sessions/[id] inside its own folder-tab.
- [x] **#39** Pencil on session detail used to `router.replace("/(admin)?editSessionId=&focusDate=")` which routed back to the dashboard before opening the edit sheet. Refactored: extracted the edit sheet + state machine into `<SessionEditSheet>` + `useSessionEditSheet()` hook in `apps/mobile/components/ui/session-edit-sheet.tsx`. Both the dashboard and the session detail page now mount the sheet inline. The dashboard's param-watching `useEffect` was removed.

### Visual
- [x] **#40** Slash session card time digits realigned. Both digit groups now share `lineHeight: 20`; the slash uses `lineHeight: 20` too (was 28) and is positioned via `transform: [{translateY: -1}]` so it visually crosses through without affecting layout. Skew bumped from -12° to -14°. Min width 78px (was 64) leaves room for "HH:mm / HH:mm" without clipping.
- [x] **#41** Sala (room) moved to its own row under the class-type meta line. Previously crowded the trainer chip via `[trainerName, room].join(" · ")`; now `room` renders below at the same left padding (`pl-[78px]`) as the time block.
- [x] **#42** Tap on booked-client row in session detail no longer navigates to `/klijenti`. The whole row is now a non-interactive `View` with no chevron. Just shows avatar + name + email.
- [x] **#43** Confirm-delete dialog buttons (`OTKAŽI` / `OBRIŠI`) had `className="rounded …"` (Tailwind `rounded` = 4px), inconsistent with the rest of the app's `rounded-2xl` buttons. Replaced bespoke `Pressable`s with the standard `<Button variant="secondary">` and `<Button variant="danger">` so radius, height, and haptic feedback match.

### Filters & data
- [x] **#44** Default `lateCancelHours` 12h → 8h. Updated Prisma schema default + migration `20260508134700_default_late_cancel_8h` + UI form defaults in `(admin)/packages.tsx` (create + edit forms).
- [x] **#45** Naplata month chevrons now actually filter records. Stabilised `billingQueries.listInfinite` cache key from `["billing", "list-infinite", filters]` (object) to `["billing", "list-infinite", clientUserId, from, to]` (primitives). Added `billing-month-filter.test.ts` proving the API filter works for April / May / June.
- [x] **#46** Naplata client filter dropdown now filters records (same primitive-key fix as #45 unblocked it).
- [x] **#47** Izveštaji period pills (`Nedelja / Mesec / Kvartal`) now produce different stat strip data. Root cause: `reportsQueries.summary()` had a static queryKey `["reports", "summary"]` and the API ignored `from/to`. Fix: `summary()` now accepts optional `from/to`, and `/api/reports/summary` filters `totalSessions`, `revenue`, and `activeClients` by the window when params are present (totalClients stays all-time — it's the directory size). When called with no params (e.g. dashboard tile) the endpoint returns all-time totals as before.
- [x] **#48** Izveštaji section bodies (Rezervacije / Mesečni prihod / Iskorišćenost / Paketi) now render reliably. Each section was `null`-ing both the empty-state and the body during `isLoading`; switched to a clear ternary that shows skeleton while loading, error if errored, empty-state if no data, otherwise the body.
- [x] **#49** Added `Godina` (yearly) period pill. Window: real-now − 1 year, bucket = `month`. New i18n keys `admin.manage.periodYear`.

### New features
- [x] **#50** Per-ClassType + per-Trainer utilization drilldowns (parallel to #23). New endpoints `/api/reports/utilization/by-class-type` and `/by-trainer` return rows of `{ id, name, totalCapacity, totalBooked, utilization }` sorted busiest-first. Two new reusable `<UtilizationDrilldown>` blocks under the existing "Po sali" section. 4 new integration tests (`reports-utilization-by-class-type.test.ts`, `reports-utilization-by-trainer.test.ts`).
- [x] **#51** Beefier seed bookings: in addition to the two clean bookings, the rich seed now creates a pre-cutoff cancellation (no penalty), a late cancellation (consumed a session), and a waitlist entry on the same session. Surfaces edge cases that reports / dashboards used to never see in dev.

### Investigations
- [x] **#52** Splash logo absent — root cause is the splash screen + app icon are **native build resources** baked into the dev client at prebuild time. Editing `app.json` or replacing `splash-icon.png` requires a fresh dev client build (`npx expo run:ios` or EAS) — Metro hot-reload does not refresh native bundle resources. The asset files (`apps/mobile/assets/images/splash-icon.png`, `assets/studio/baza-logo*.webp`) are intact: white-on-transparent renders correctly when composited on the `#2e5b42` splash background; the raw file viewer just makes them look blank because the page background is also white.
- [x] **#53** Reports page hammered the API server — terminal showed hundreds of identical `GET /api/reports/*` requests/sec. Root cause: `periodWindow` was an inline IIFE that called `new Date()` on every render → `to.toISOString()` differed by milliseconds each pass → eight queryKeys changed → eight queries refetched → state updated → re-render → repeat. Fix: wrap `periodWindow` in `useMemo([period])` and anchor `to` to the *start of tomorrow in UTC* (so `toISOString()` is stable for the whole day). The window is still wide enough that the report data is correct, but the queryKeys are now stable across renders.

---

## Round 5 — files changed

```
apps/mobile/app/(admin)/_layout.tsx                                   (sessions hidden via href: null; class-types/rooms unchanged)
apps/mobile/app/(admin)/billing.tsx                                    (no functional change; primitive-key fix is in factory)
apps/mobile/app/(admin)/clients.tsx                                    (replace bespoke confirm-delete buttons with Button component)
apps/mobile/app/(admin)/index.tsx                                      (param-watch effect removed; SessionEditSheet wired)
apps/mobile/app/(admin)/sessions/_layout.tsx                           (NEW — Stack for the sessions folder-tab)
apps/mobile/app/(admin)/sessions/[id].tsx                              (pencil opens sheet inline; booked-client row de-pressable-ified)
apps/mobile/app/(admin)/packages/_layout.tsx                           (NEW — Paketi stack)
apps/mobile/app/(admin)/packages/index.tsx                             (moved from (admin)/packages.tsx; default lateCancelHours 12 → 8)
apps/mobile/app/(admin)/reports.tsx                                    (Godina pill, summary-with-window, defensive section ternaries, UtilizationDrilldown)
apps/mobile/app/api/reports/summary/+api.ts                            (optional from/to/period; activeClients = unique bookers in window)
apps/mobile/app/api/reports/utilization/by-class-type/+api.ts          (NEW)
apps/mobile/app/api/reports/utilization/by-trainer/+api.ts             (NEW)
apps/mobile/components/ui/session-card.tsx                             (slash time alignment + room on second row)
apps/mobile/components/ui/session-edit-sheet.tsx                       (NEW — extracted edit sheet + useSessionEditSheet hook)
apps/mobile/lib/queries/billing-queries-factory.ts                     (primitive cache key)
apps/mobile/lib/queries/reports-queries-factory.ts                     (primitive cache keys; summary-with-window; new factories for by-class-type, by-trainer)
apps/mobile/locales/{en,sr}.json                                       (periodYear, utilizationByClassType, utilizationByTrainer)
apps/mobile/prisma/migrations/20260508134700_default_late_cancel_8h/   (NEW — DEFAULT 12 → 8)
apps/mobile/prisma/schema.prisma                                       (lateCancelHours @default(8))
apps/mobile/scripts/test/seed-e2e.ts                                   (mixed cancel states + waitlist entry)
apps/mobile/test/integration/billing-month-filter.test.ts              (NEW — 3 tests)
apps/mobile/test/integration/reports-utilization-by-class-type.test.ts (NEW — 2 tests)
apps/mobile/test/integration/reports-utilization-by-trainer.test.ts    (NEW — 2 tests)
```

---

## Open / deferred items

None ship-blocking. Suggested next:

1. **Tighten anchor / wall-time for dev seed.** Reports + dashboard use real wall-clock `new Date()` on the frontend; the e2e seed sometimes pins to `TEST_ANCHOR_TIME` (set in `seed-e2e-env.ts` to `2026-05-09`) which can drift up to a few days from wall time. If empty-section regressions reappear, re-seed with `pnpm --filter mobile test:db:seed-e2e` (uses wall time when `TEST_ANCHOR_TIME` env is unset) so the period-pill window catches the data.
2. **All-time pill** for Izveštaji (in addition to Godina). Still useful for year-over-year comparisons.

---

## How to pick this up in a new session

1. `cd /Users/stevanborus/Desktop/baza-app/.claude/worktrees/fix/ui`
2. `git pull --rebase origin fix/ui` to sync with origin.
3. Read this file end-to-end.
4. Read `CONTEXT.md` for domain language; `AGENTS.md` for project conventions (pnpm, anchor-time, test discipline).
5. If logging in: `pnpm --filter mobile test:db:seed-e2e` then `pnpm --filter mobile dev`.
6. Verify suite is still green: `pnpm --filter mobile test:unit` + `pnpm --filter mobile test:integration` + `pnpm --filter mobile test:e2e`.
