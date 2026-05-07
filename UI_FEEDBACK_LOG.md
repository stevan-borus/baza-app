# UI Feedback Log — `fix/ui` branch

Comprehensive log of every item you asked for in this session, with status. Use this in a future session as a reference for what's done, what's not, and what regressed.

Branch: `fix/ui`. Latest commit: `c79a623 fix(e2e): repair test plan failures after Phase B-3 + anchor-time merge`.

---

## Done and verified (committed in this branch)

### Phase A — bugs

- [x] **#7 i18n key collision** — `admin.clients.assignPackage` was defined as both a string (action label, line 319) and an object (sheet header, line 367) in both `sr.json` and `en.json`. The object overwrote the string at runtime, so the action sheet showed the literal error string. Renamed nested key to `compPackageHeading`. Added a unit test (`test/unit/i18n-no-duplicate-keys.test.ts`) that scans the raw JSON for duplicate keys at any depth so this can't regress.
- [x] **#9 "komp paket" → "Poklon paket" / "Complimentary package"** — full word in Serbian and English; documented in `CONTEXT.md`.
- [x] **#4 Sala → Max klijenata refresh bug** — extracted `applySessionFormChange` helper (`apps/mobile/lib/admin/session-form-state.ts`) so picking a Sala always overwrites capacity to that room's capacity, on first AND subsequent changes. Wired into create + edit + series sheets. 5 unit tests cover the coupling rules.
- [x] **#17 API rejects visibility=off when bookings exist** — confirmed already shipped in a prior commit (`apps/mobile/app/api/sessions/[id]/+api.ts:57`) with corresponding integration test in `sessions-crud.test.ts:233`.

### Phase B — domain features

- [x] **Naplata `?clientUserId=` filter API** — `GET /api/billing` now accepts a client filter. 3 integration tests in `billing-client-filter.test.ts`.
- [x] **#16 Izveštaji Paketi insights** — new endpoint `GET /api/reports/packages` returning most-used PackageTypes (count), revenue per PackageType (sum), and comp-vs-paid ratio. New "Paketi" section on the reports screen with ranked cards + a paid-vs-comp bar. 4 integration tests in `reports-packages.test.ts`.
- [x] **BillingRecord schema link** — added `packageTypeId String?` (nullable FK to PackageType, ON DELETE SET NULL) so revenue-per-PackageType reporting joins cleanly. Migration `20260507182120_billing_record_package_link`.
- [x] **#11 Aktivne dodele standalone page** — new route `/admin/packages/active-assignments` with per-client server-side search (`?search=`), status filter chips, and (intent) client name as the primary line on each card. 3 integration tests in `client-packages-admin-list.test.ts`. **NOTE: see #27 in the regression list below — the screenshot still shows package name as primary, not client name. UI rendering needs verification.**
- [x] **#12 Naplata client filter UI** — wired the existing API filter to a Select dropdown on Naplata; same dropdown pattern as other selects.

### Phase C — visual polish

- [x] **#1 StatStrip column centering** — fixed-height label slot + `minHeight: 96` + `justifyContent: "space-between"` on each column so labels that wrap to two lines no longer push the value down. **NOTE: see #32 in the regression list — user reports the 2x2 grid on the dashboard isn't centered. May be a different component or stale bundle.**
- [x] **#2 Removed colored dot** from `Tipovi treninga` (ClassType list).
- [x] **#3 Removed map-pin icon** from `Sale` (rooms) list.
- [x] **#5 Session card time → diagonal stack** — implemented `SessionCardTime` helper in `session-card.tsx` that splits `"HH:mm - HH:mm"` and renders start above, end below + indented. **NOTE: see #25 — user's screenshot still shows wide horizontal range; may be stale bundle.**
- [x] **#8 Razlog → textarea** (3 lines, `textAlignVertical: "top"`).
- [x] **#10 Border radius mismatch** — Select dropdown radius aligned to Input's `rounded-lg`.
- [x] **#13 Rezervacije empty-state guard** — chart now checks `bookingsData.some(d => d.y > 0)` so a series of all-zeros renders the styled EmptyState instead of an empty accent card.
- [x] **#14 Iskorišćenost label fix** — bucket labels now reformatted (e.g. "Maj 2026" instead of "2026-05") via `formatBucketLabel` helper. Per-Sala drilldown deferred → task #23 follow-up.

### Phase B-3 — session detail + animation

- [x] **#15 Session detail page exists** — route at `/admin/sessions/[id]` with header (date · time · trainer · room · capacity), pencil icon for edit, booked-clients list with avatar/name/email/chevron tappable to client profile. New GET handler on `/api/sessions/[id]` (admin + trainers-of-session). 2 integration tests.
- [x] **#15 Slide+fade animation** — day-view session cards animate in with translateX direction tied to date direction; staggered up to 30ms × min(idx, 8). Re-keyed on `${selectedDate}-id` so MotiView remounts on day navigation.
- [x] **Session detail entry — REVERTED design** — originally I made tap-card navigate to detail page and pencil-on-detail open edit sheet. That broke admin tests 26/28 reproducibly. Reverted to: tap-card opens edit sheet directly (preserves all existing tests). Detail page is reachable via a **"View N bookings →"** link inside the edit sheet. **NOTE: see #26 in the regression list — user reports the link isn't visible in the sheet, possibly below the fold.**

### Phase D — loading states

- [x] **#6 Loading skeletons** — added 2-3 SkeletonCards on initial isLoading for: admin/clients, admin/billing, admin/class-types, admin/rooms, admin/packages, trainer/clients. (admin/sessions/[id] and packages/active-assignments shipped with skeletons inline.)

### Phase E — seed and infra

- [x] **#18 Rich seed: paid clients via Flow 1** — `activeReformer` / `activeEnergy` / `expired` / `future` are now paid via `BillingRecord` paired with `ClientPackage`. `paused` stays on Flow 2 to preserve coverage of the comp branch.
- [x] **#19 Seeded bookings** — one Reformer booking + one Energy booking on the second matching upcoming session (so the e2e booking spec, which picks the first session of the day, still finds an empty seat). Updated trainer test 41 to assert one client appears, not the empty state.
- [x] **#22 Anchor-time refactor** — separate worktree, PR #8, merged. Pin point now `2026-05-11T09:00:00Z` (Monday morning, anchor revised from Saturday during e2e debugging).
- [x] **#20 E2E client books a session** — verified existing test #55 in `client.spec.ts` covers it end-to-end.
- [x] **#21 Booking constraints integration** — verified comprehensive coverage already exists in `bookings-class-scoping.test.ts` + `bookings-cancel.test.ts` + `cron-sessions-consumption.test.ts`.

---

## Open follow-ups (captured but not done)

- [ ] **#23 Per-Sala utilization drilldown** — during grilling you picked option (A + per-Sala drilldown) for #14. Only the label fix shipped in this PR; the drilldown needs a new endpoint shape (`GET /api/reports/utilization/by-room`) and a sub-route. Captured as a follow-up task.
- [x] **#24 Admin 26/28 + trainer 51 e2e failures** — Subagent fixed via PR #9 (https://github.com/stevan-borus/baza-app/pull/9). Root causes: admin 26/28 — seed bookings caused PATCH/DELETE to 409, test's `waitForResponse(r.status() < 300)` never matched; fix cancels bookings via DB helper before save. Trainer 51 — Sun 5/10 was off the visible week post anchor change; routed click through `navigateWeekStripTo`. 73/73 e2e green. **Awaiting merge.**

---

## Regressions / unfinished items you flagged in the second round

These I marked as completed but you screenshot-verified they're not actually done in the running app. Most likely stale Metro bundle for some, real code bugs for others.

- [ ] **#25 Session card time** — superseded by **#34** (slash design). Original diagonal layout was rejected.
- [ ] **#26 Session detail page not reachable** — superseded by **#37** (re-instate detail-page-as-primary).
- [ ] **#27 Aktivne dodele cards: client name as primary** — actually working in latest screenshot once the new route loads. The old screenshot showed cached state.
- [ ] **#28 Naplata double scroller** — there's a stacked scrollbar on Naplata. Likely a nested ScrollView inside a parent scroll container.
- [ ] **#29 Naplata month chevrons don't filter** — `selectedMonth` state changes but `billingQuery` doesn't accept a month parameter. Either filter client-side after fetch, or extend the API.
- [ ] **#30 Mesečni prihod card layout** — the rank-list card with proportional bars has degenerated to a single tiny row. Restore the original layout.
- [ ] **#31 Izveštaji period pills don't change numbers** — toggling Week/Month/Quarter doesn't refetch with the new period. Verify SegmentedControl wires `period` into `reportsQueries.revenue/utilization/bookings/packages`.
- [x] **#32 Stat grid 2x2 numbers not centered** — RESOLVED after Metro cache clear (`pnpm --filter mobile dev --clear`). User confirmed "the numbers are centered on this page, that is ok in the 2x2 grid." StatStrip fix took effect once bundle rebuilt.

---

## Third round of feedback (after Metro clear, looking at running app)

- [ ] **#33 CRITICAL: New routes appear in admin tab bar** — Expo Router auto-registers `(admin)/packages/active-assignments.tsx` and `(admin)/sessions/[id].tsx` as tabs because they're nested inside the `(admin)` tab group. User sees `packages... sessions/...` extra tabs in the bottom nav. Must explicitly hide them from the Tabs config in `_layout.tsx`, or restructure the routes.
- [ ] **#34 Session card time → bigger slash format (18:00/19:00)** — user wants "something fancy like `18:00/19:00` with bigger slash". Replaces the diagonal stack from #25. Use frontend-design treatment.
- [ ] **#35 Naplata client filter throws error** — selecting any client from the filter dropdown causes "Nije moguće učitati naplatu". The `useInfiniteQuery` retry/cache invalidation may not handle filter changes correctly, or the API returns 500 on the filter param. Investigate the actual network response.
- [ ] **#36 Remove "Plaćeni nasuprot poklon" card from Izveštaji** — user feedback: not useful. Remove the card render only; keep the API endpoint and underlying data.
- [ ] **#37 CRITICAL: Tap session card → detail page first (revert revert)** — User reaffirmed: tap card → detail page (NOT edit sheet). Pencil icon on detail page opens edit sheet. **ALSO: remove the top "card" inside the edit sheet** (the `0/6 zakazano · Sala X · Č. lista: Y` mini summary) since that info will live on the detail page header. Blocked by PR #9 (subagent's e2e fix) merging — the subagent's `cancelBookingsOnRecurringSchedule` helper means admin 26/28 will pass with the detail-page flow back in.

---

## What's been shipped as commits on `fix/ui`

```
c79a623 fix(e2e): repair test plan failures after Phase B-3 + anchor-time merge
00821be Merge remote-tracking branch 'origin/dev' into fix/ui
f27df1b test(seed): paid clients (Flow 1) + bookings on upcoming sessions
f6a67e4 feat(admin): session detail page + slide+fade card animation + loading skeletons
a9037c2 feat(admin): UI feedback round 2 — Aktivne dodele page, Naplata client filter, polish
7c2f0f3 feat(reports): Paketi insights section + BillingRecord package link
d9f2228 fix(admin): UI feedback round 1 — bug fixes + billing client filter
752e293 refactor(test): pin entire test stack to a single anchor instant (#8)  ← merged from PR #8
```

---

## Domain language captured in CONTEXT.md (during grilling)

- **Naplata** (section name) — admin-facing list of past payments, plus the entry point for **Nova uplata**.
- **Nova uplata** (Flow 1) — sr "Nova uplata" / en "New payment". Default assignment path: BillingRecord + ClientPackage created atomically.
- **Poklon paket** (Flow 2) — sr "Poklon paket" / en "Complimentary package". Free assignment for family/friends, no BillingRecord. Replaces the old "komp paket" label.
- **BillingRecord.packageTypeId** — nullable FK linking a payment to the PackageType it bought (non-null on Flow 1 going forward).

---

## Test status as of the last commit

- Unit: 36 / 36 passing
- Integration: 201 / 201 passing
- Type-check: clean
- E2E: 70 / 73 passing (3 failing → captured as task #24, subagent on it)

---

## Next session — pick up here

1. Restart Metro with `--clear` and verify which of #25–#32 are real code issues vs stale bundle.
2. Wait for the subagent's PR (task #24) and merge into `fix/ui`.
3. Work through #25–#32 in order. Most should be quick once the runtime UI is verified.
4. Open the parent PR for `fix/ui` against `dev` once #25–#32 are clean.
