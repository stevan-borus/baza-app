# Phase 4: Trainer Screens — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign all trainer-facing screens: Schedule (with day/week/month views), Clients (grouped by session), and Notes (infinite scroll + create sheet).

**Architecture:** Trainer keeps 3 tabs. Schedule tab gets segmented day/week/month views sharing components with client calendar. Clients tab groups clients by upcoming session date. Notes tab uses infinite scroll with FAB for creation.

**Tech Stack:** Tamagui, Expo Router, TanStack Query, react-native-big-calendar (month view only), Phase 1 components

**Spec reference:** `docs/superpowers/specs/2026-03-10-ui-redesign-design.md` — Section 4: Trainer Screens

**Prerequisite:** Phase 1 (Design System & Components) must be complete.

---

## Chunk 1: Schedule Tab

### Task 1: Redesign Trainer Schedule Tab

**Files:**
- Modify: `apps/mobile/app/(trainer)/index.tsx`

- [ ] **Step 1: Read the current trainer schedule screen**

Read `apps/mobile/app/(trainer)/index.tsx` to understand current data fetching, segmented control, and sheet logic.

- [ ] **Step 2: Rewrite schedule tab**

Layout (ScreenContainer with ScrollView):

1. **Greeting:** "Hello, [Name]" (24px bold) + current date in secondary text.

2. **Segmented control:** `SegmentedControl` with segments: Day, Week, Month. State: `viewMode`.

3. **Today's stats card:** `XStack` with two `StatCard`s side by side (flex 1 each):
   - "Sessions Today" with count value
   - "Clients Today" with count value
   Data: query today's sessions, sum booked counts.

4. **View-dependent content:**

   **Day view (default):**
   - `WeekStrip` with selected date, activity dots from sessions
   - Below: `SectionHeader` with formatted day name
   - List of `SessionCard` components for selected day. Each card has:
     - `classType` prop for colored left border (Yoga=teal, Pilates=green, HIIT=coral)
     - Time, class name, room, capacity badge
     - Tap → session detail sheet (read-only)

   **Week view:**
   - 7-column grid header (Mon-Sun labels)
   - Below header: for each day with sessions, a column of compact session blocks
   - Each block: small glass card showing time + class name, sized proportionally
   - Tap a block → opens same detail sheet
   - Implementation: `XStack` of 7 `YStack` columns, each containing session blocks. Use `ScrollView` horizontal if needed.

   **Month view:**
   - `react-native-big-calendar` component in month mode
   - Restyle: dark background cells, green event indicators
   - Events formatted as "[ClassName] ([booked]/[capacity])"
   - Tap a day → switch to Day view for that date (update `viewMode` to "day" and `selectedDate`)

5. **Session detail sheet:** `AppSheet` with:
   - Class name heading
   - Info rows: date/time, duration, room, trainer (self)
   - Capacity badge
   - "Booked Clients" section: list of client names. Each row shows avatar (initials), name, and a preview of the most recent trainer note for that client (if any), in tertiary text.
   - No edit actions (trainer is read-only for session management)

- [ ] **Step 3: Remove sign-out and language switcher**

Move these to a settings area or keep them in the schedule header via a gear icon. For trainer, add a small gear icon top-right of the greeting that opens an `AppSheet` with language switcher + sign-out.

- [ ] **Step 4: Verify all three view modes**

Test Day, Week, and Month views. Verify data loads, cards render, sheet works.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/(trainer)/index.tsx
git commit -m "feat: redesign Trainer Schedule with day/week/month views and glass theme"
```

---

## Chunk 2: Clients Tab + Notes Tab

### Task 2: Redesign Trainer Clients Tab

**Files:**
- Modify: `apps/mobile/app/(trainer)/clients.tsx`

- [ ] **Step 1: Read the current trainer clients screen**

Read `apps/mobile/app/(trainer)/clients.tsx`.

- [ ] **Step 2: Rewrite clients tab**

Layout (ScreenContainer with ScrollView):

1. **Header:** `ScreenTitle` "My Clients" with count badge inline (e.g., "My Clients" + `Badge` neutral "24")

2. **Grouped list:** Data is upcoming sessions with their booked clients. Group by date:

   For each date group:
   - **Date header:** "Monday, March 10" (15px semibold, secondary color)
   - **Session subheader:** `XStack` with class name + time + `Badge` showing capacity ("4/8")
   - **Client rows:** For each client in that session:
     - `GlassCard` size="sm" interactive:
       - `XStack`: avatar circle (32x32, initials), `YStack` with name (15px, primary text) + email (13px, secondary text), chevron right
       - Expandable: tap toggles showing existing trainer notes for this client below the row. Notes shown as indented text blocks with date.

3. **Empty state:** `EmptyState` with `icon="users"` and "No upcoming sessions"

4. **Pull-to-refresh**

- [ ] **Step 3: Verify**

Check that clients are grouped correctly, expand/collapse works, empty state shows.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/(trainer)/clients.tsx
git commit -m "feat: redesign Trainer Clients tab with session-grouped list and expandable notes"
```

---

### Task 3: Redesign Trainer Notes Tab

**Files:**
- Modify: `apps/mobile/app/(trainer)/notes.tsx`

- [ ] **Step 1: Read the current trainer notes screen**

Read `apps/mobile/app/(trainer)/notes.tsx`.

- [ ] **Step 2: Rewrite notes tab**

Layout (ScreenContainerRaw — no ScrollView since LegendList handles scrolling):

1. **Header:** `ScreenTitle` "Session Notes" at top with padding.

2. **Notes list:** `LegendList` (infinite scroll, keep existing pattern). Each item is a `GlassCard`:
   - Top row: `XStack` with client name (15px semibold) left, date right (13px tertiary)
   - Second row: session/class name (13px secondary)
   - Body: note text, max 2 lines with ellipsis truncation. Tap card to expand full note in a sheet.
   - Pull-to-refresh

3. **FAB:** Positioned absolute bottom-right (above tab bar). Green circle (56x56) with "+" icon. Uses `Pressable` with `pressStyle` scale. `cursor: "pointer"` for web.

4. **Create note sheet:** `AppSheet` with:
   - `SectionHeader` "New Note"
   - Session picker: `GlassCard` interactive showing "Select session" → when tapped, shows a list of recent sessions (last 10) to pick from. Each session shows class name + date.
   - Client picker: appears after session is selected. Shows clients from that session. Each is a tappable row with avatar + name.
   - Note text: multiline `Input` (or `TextArea` styled with glass) with `label="Note"` and `numberOfLines={4}`
   - "Save Note" `Button` primary, disabled until all fields filled
   - On success: dismiss sheet, refetch notes list

5. **Empty state:** `EmptyState` with `icon="pencil"` and "No notes yet" + "Create your first note" action

- [ ] **Step 3: Verify**

Test creating a note, viewing notes, expanding a note, pull-to-refresh.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/(trainer)/notes.tsx
git commit -m "feat: redesign Trainer Notes tab with glass cards, FAB, and create sheet"
```

---

## Summary

After Phase 4, the trainer experience is fully redesigned:
- **Schedule:** Day/Week/Month views with segmented control, stats card, session detail sheets
- **Clients:** Grouped by session date, expandable notes per client
- **Notes:** Infinite scroll glass cards, FAB, create note sheet with session+client picker
