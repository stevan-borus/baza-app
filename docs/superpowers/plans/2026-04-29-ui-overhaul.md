# UI Overhaul Plan — 2026-04-29

Master plan to fix structural UI issues uncovered after the Uniwind migration. One plan, multiple phases, each shippable independently.

## Decisions locked in

**Header system**
- Forest-green opaque bar across all in-app screens
- Slots: avatar (top-left, opens settings/profile sheet) · centered title · contextual action (top-right, e.g. `+`)
- Detail screens: chevron back replaces avatar
- Title source-of-truth = header. Screens drop their inline `<H1>`
- Light mode: same forest-green band (brand identity stays consistent)
- iOS gets a subtle backdrop blur over the green band; Android stays opaque (no perf cost)

**Bottom nav**
- Camp A: flat tab bar, full-width, page-bg colored, hairline border on top
- Labels under icons (10pt)
- Selected = filled icon + accent green + label same color
- Inactive = outlined icon + muted gray + label muted gray
- 5 tabs (admin: Schedule · Clients · Packages · Billing · Reports). Settings moves to header avatar
- Trainer: 4 tabs unchanged (Schedule · Clients · Notes · Profile)
- Client: 4 tabs unchanged (Overview · Calendar · Notifications · Profile)

**Bottom sheets**
- Use `@gorhom/bottom-sheet` `enableDynamicSizing` (snap to content)
- Max height 90% of screen
- Opaque background, no transparency: `#0F1419` (dark) / `#fafaf8` (light)
- Backdrop dim 50%
- Drag-to-dismiss

**Calendar**
- 7-day strip always visible (no horizontal scroll, divide screen-width by 7)
- Arrows = prev/next week (never month)
- Selecting first day stays in current week (fix off-by-one)
- Day/Week/Month toggle: ship all 3 in this plan
- Week view: vertical 7-col timeline (6am–10pm), session blocks positioned by time
- Month view: 7×6 grid, dot per day with sessions, tap drills into Day

**Light theme**
- Full token system with light variants
- Fix `useColorScheme.web.ts` (currently hardcoded `"light"`)
- Every component reads tokens (no hardcoded white/dark)

**i18n**
- Audit + fix every untranslated string surfaced
- Fix `admin.manage.transactions` lookup failure in billing
- Add missing dashboard stat keys in both locales

**Other**
- Billing card layout: stack label-on-top-of-value (no horizontal gap fight)
- Segmented control: unify on one component, replace pill-chips on Klijenti/Pozivnice
- Server logging fix: structured logs visible in `pnpm dev`
- Packages API bug: investigate + fix

---

## Audit findings (carried into tasks)

**Calendar surfaces (need rework):**
- `components/ui/week-strip.tsx` (horizontal scroll → fixed 7-col)
- `app/(admin)/index.tsx` (Day/Week/Month toggle, currently coming-soon)
- `app/(trainer)/index.tsx` (uses WeekStrip + TimeAxisDayView)
- `app/(client)/calendar.tsx` (full month-paged, switch to week-paged)
- `app/(client)/index.tsx` (WeekStrip on home)

**Sheet usages (17 instances)** — see audit. All currently snap to 60%/90% regardless of content.

**Hardcoded-dark components (won't flip in light mode):**
- `Input` (icon color, placeholder)
- `ProgressRing` (text-white, track color)
- `Button` (text-white)
- `WeekStrip` (all text colors)
- `GlassCard`, `Badge`, `SessionCard` (use `bg-glass` which is white-rgba)
- Sign-in / reset-password (already dark-only by design — exempt)

**Untranslated strings:**
- `app/(admin)/index.tsx` lines 248, 261, 285, 291, 300, 310, 339, 425
- `app/(admin)/billing.tsx` line 221 (fallback, but key is wrong: `admin.manage.transactions` doesn't exist; should be `admin.manage.transactionCount`)

**Duplicate titles:** Admin Dashboard, Admin Clients (header + ScreenTitle both rendered)

**Two SegmentedControl components with same name, different APIs:** consolidate.

**Dark band cause:** Header is transparent BlurView; `ScreenContainer` adds `paddingTop = insets.top + 12` but header overlays as floating glass, creating a band where the dark bg shows between safe-area and content.

---

## Phases

Each phase is independent, shippable, has its own task list and acceptance criteria.

### Phase 1 — Design tokens + light theme foundation
**Goal:** unbreak light mode at the token layer before touching components.

Tasks:
1. Refactor `global.css` to define light + dark token sets via `@media (prefers-color-scheme)` AND a class-based override (`.dark` / `.light`) so `ThemePreferenceProvider` can force a theme regardless of system setting.
2. Add light variants for: `--color-background`, `--color-foreground`, `--color-muted`, `--color-glass`, `--color-glass-border`, `--color-card`, `--color-divider`, `--color-accent`, `--color-accent-soft`, `--color-danger`, `--color-success`, `--color-warning`.
3. Fix `components/useColorScheme.web.ts` to read from `useThemePreference().resolvedTheme` (currently hardcoded `"light"`).
4. Update `tokens.ts` to export `useThemeTokens()` hook returning resolved values (replaces hardcoded `GLASS_BG`, `GLASS_BORDER`, etc.).
5. Verify: toggle theme in settings; every screen flips correctly. Take screenshots both modes.

**Acceptance:** dashboard renders with light bg and readable text in light mode.

### Phase 2 — Header system
**Goal:** unified forest-green header across all logged-in screens.

Tasks:
1. Build `<AppHeader>` component at `components/ui/app-header.tsx`:
   - Forest-green opaque bg with iOS BlurView overlay (subtle, 30 intensity) when on iOS
   - Slots: `leftSlot` (avatar / chevron), `title` (centered), `rightSlot` (action(s))
   - Hairline bottom border `rgba(255,255,255,0.06)`
   - Height = safe-area-top + 52pt
2. Build `<UserAvatar>` component (small circular initial-badge, top-left, opens settings sheet).
3. Build `<ProfileSheet>` (sheet content): user info row → Settings link → Theme switcher → Language switcher → Sign out. Replaces direct settings tab access.
4. Wire header into role layouts: `app/(admin)/_layout.tsx`, `app/(trainer)/_layout.tsx`, `app/(client)/_layout.tsx`. Use Stack screenOptions or render directly per screen — pick whichever is cleaner with Expo Router 6.
5. Detail screens (e.g., `(admin)/settings/class-types`, `(admin)/settings/rooms`): chevron back in `leftSlot`.
6. Remove duplicate inline H1s from screens that now have a header title.
7. Fix the dark-band issue: headers are now part of the screen flow (not floating overlay), so `ScreenContainer` no longer needs `paddingTop = insets.top + 12`. Adjust `screen-container.tsx` accordingly.

**Acceptance:** all in-app screens have the green header; no duplicate titles; no dark band.

### Phase 3 — Bottom nav redesign
**Goal:** flat tab bar, page-bg colored, accent selection.

Tasks:
1. Replace `FloatingTabBar` in `lib/tab-layout-theme.tsx` with a flat full-width tab bar.
2. Bg = page bg color (token-driven). Hairline top border.
3. Each tab: outlined icon + label below (10pt). Selected: filled icon + accent green + label same color.
4. Remove Settings tab from admin (`href: null` config — already done; just remove from icon row).
5. Replace icons that are missing/broken (the gap shown in screenshots = the hidden Settings tab leaving a blank slot).
6. Update tab heights / `TAB_BAR_HEIGHT` constant; adjust `ScreenContainer` paddingBottom.
7. Verify all 3 role layouts (admin 5-tab, trainer 4-tab, client 4-tab).

**Acceptance:** tab bar matches page bg in both themes; selected state visible at a glance; no orphan slot.

### Phase 4 — Bottom sheet fix
**Goal:** auto-size, opaque, capped at 90%.

Tasks:
1. Refactor `components/ui/sheet.tsx` (`AppSheet`):
   - Remove hardcoded `snapPoints={["60%", "90%"]}`
   - Use `enableDynamicSizing={true}` from gorhom v5 (or `bottomSheetRef.current?.snapToPosition('CONTENT_HEIGHT')` pattern with content `onLayout`)
   - Set `maxDynamicContentSize` based on screen height × 0.9
   - Background: opaque token-driven color (no transparency). Add `backgroundStyle={{ backgroundColor: ... }}`
   - Backdrop: 50% black dim, dismiss on tap
   - Keep drag-to-dismiss
2. Audit each of the 17 sheet usages. Remove any min-height / large padding that was compensating for the broken behavior. Ensure each sheet's content has natural height.
3. Special-case: large scrollable sheets (admin schedule create/edit, billing create) need `BottomSheetScrollView` instead of `BottomSheetView`. Cap at 90%.

**Acceptance:** every sheet opens at content height; no transparency; sheets with long content cap at 90% and scroll.

### Phase 5 — Calendar overhaul
**Goal:** single shared calendar that does Day/Week/Month right.

Tasks:
1. Build new `<WeekStrip>` (replace existing):
   - 7 cols, `flex-1` each, no horizontal scroll
   - Arrows = prev/next week (Sunday→Saturday boundary, or Mon→Sun depending on locale)
   - Today highlighted by default
   - `onSelect(date)` callback — never auto-jumps weeks
   - Activity dot per day (count from sessions array)
2. Build `<DayView>` (extract from current schedule screens): time-axis 6am–10pm, sessions positioned by start/duration, tap → details.
3. Build `<WeekView>`: vertical timeline 6am–10pm × 7 columns. Sessions render as colored blocks. Tap → details. No drag-create v1.
4. Build `<MonthView>`: 7×6 grid. Each day cell shows day number + dot if sessions exist. Tap → drills to Day view.
5. Build unified `<CalendarSection>` wrapper: takes `view: "day" | "week" | "month"`, `selectedDate`, `onSelectDate`, `sessions`. Renders the right sub-view.
6. Replace current `<SegmentedControl>` Day/Week/Month with the unified one (Phase 6 component) — no more "coming soon."
7. Wire into screens: `(admin)/index.tsx`, `(trainer)/index.tsx`, `(client)/calendar.tsx`, `(client)/index.tsx`.
8. Fix the "select first day → jumps week" bug: ensure `onSelect` only updates `selectedDate`, never mutates `weekStart`.

**Acceptance:** all 3 views work, week-paged navigation everywhere, no off-by-one.

### Phase 6 — Segmented control unification
**Goal:** one component, used everywhere.

Tasks:
1. Pick the better implementation between `components/ui/segmented-control.tsx` and `components/ui/bento/segmented-tabs.tsx`. Prefer the one with cleaner Moti animation.
2. Delete the loser. Update all imports.
3. Replace pill-chip toggles on Admin Clients page (Klijenti/Pozivnice) with the unified component.
4. Replace billing filter chips (Sve/Potvrđen/Na čekanju/Otkazan) — same component.
5. Replace packages filter chips (Sve/Uskoro ističe/Istekao) — same component.

**Acceptance:** one segmented control component, used in 5+ places.

### Phase 7 — i18n cleanup
**Goal:** zero raw English in Serbian build.

Tasks:
1. Add missing keys in `en.json` AND `sr.json`:
   - `admin.dashboard.title`
   - `admin.dashboard.revenueThisMonth`
   - `admin.dashboard.sessionsToday`
   - `admin.dashboard.newClientsMonth`
   - `admin.dashboard.attendanceRate`
   - `admin.dashboard.todaySchedule`
   - `admin.dashboard.weekView`
   - `admin.dashboard.monthView`
   - `admin.dashboard.comingSoon` (if we keep placeholders for v1; remove if Phase 5 ships all 3 views)
2. Fix `admin.manage.transactions` → `admin.manage.transactionCount` in `app/(admin)/billing.tsx`.
3. Replace hardcoded strings in `app/(admin)/index.tsx` lines 248, 261, 285, 291, 300, 310, 339, 425 with `t()` calls.
4. Re-grep the codebase for any other untranslated literals (Phase 7's deliverable includes a follow-up scan).

**Acceptance:** Serbian app shows zero English literals on every screen.

### Phase 8 — Component-level light-mode fixes
**Goal:** sweep every component to use tokens.

Tasks:
1. `Input` (`components/ui/input.tsx`): use `text-muted` token for icon/placeholder colors instead of `rgba(255,255,255,0.5)`.
2. `ProgressRing`: use `text-foreground` instead of `text-white`; track color from token.
3. `Button`: variant-aware text colors via tokens.
4. `WeekStrip` (rebuilt in Phase 5): all colors via tokens.
5. `GlassCard`, `Badge`, `SessionCard`: rely on `bg-glass` / `border-glass-border` which Phase 1 made theme-aware.
6. Audit remaining files in `components/ui/` for any `text-white`, `rgba(255,255,255,*)`, `#0A0F14` literals; replace.

**Acceptance:** flip theme → every screen readable.

### Phase 9 — Billing card layout
**Goal:** fix the cramped "Transakcije / Prosek po klijentu" row.

Tasks:
1. Stack label-above-value in the totals card on `app/(admin)/billing.tsx`.
2. If grid is needed: 2-col grid with even spacing, no `justifyContent: 'space-between'` collision.

**Acceptance:** no edge collision, readable label hierarchy.

### Phase 10 — Server logging + packages API bug
**Goal:** see logs in `pnpm dev`; fix the broken endpoint.

Tasks:
1. Inspect Expo Router API route logging setup. Find why `console.log` / `console.error` from `+api.ts` files isn't surfacing in `pnpm dev` terminal.
2. Add structured request logger middleware (or simple console.log wrapper) at API boundary.
3. Trigger the packages list endpoint, capture the actual error, fix root cause.
4. Add error response shape that the client can render usefully (currently shows generic "Nije moguće učitati pakete").

**Acceptance:** server errors visible in terminal; packages page loads.

---

## Execution order

1. **Phase 1** (light theme tokens) — blocks Phases 2, 3, 4, 8
2. **Phase 2** (header) — independent of 3
3. **Phase 3** (bottom nav) — independent of 2; can parallelize
4. **Phase 4** (sheets) — independent; can parallelize with 2/3
5. **Phase 5** (calendar) — independent; can parallelize with 2/3/4
6. **Phase 6** (segmented control) — needs Phase 5 (Day/Week/Month uses it)
7. **Phase 7** (i18n) — independent; do after 1-6 to translate any new strings introduced
8. **Phase 8** (component sweep) — needs Phase 1
9. **Phase 9** (billing) — independent; quick win
10. **Phase 10** (logging + API bug) — independent backend work

Recommended grouping:
- **Wave 1** (foundation): Phase 1
- **Wave 2** (parallel): Phases 2, 3, 4, 5, 9, 10
- **Wave 3** (sweep): Phases 6, 7, 8

---

## Open questions for user

None at plan-write time. All decisions captured in the "Decisions locked in" section above.

If anything in those decisions feels wrong, push back before we start coding.
