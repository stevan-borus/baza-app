# Phase 5: Admin Screens — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign all admin screens: Dashboard/Schedule, Clients, Packages, Billing, Reports, and Settings. Restructure navigation: remove Settings from tab bar, make it a gear icon → stack screen. Reduce tabs to 5.

**Architecture:** Admin layout restructured from 6 tabs to 5 tabs + Settings as stack screen. Schedule tab doubles as dashboard with stats row. All screens use Phase 1 glass components. Reports tab uses victory-native for charts.

**Tech Stack:** Tamagui, Expo Router, TanStack Query, react-native-big-calendar (month view), victory-native (charts), Phase 1 components

**Spec reference:** `docs/superpowers/specs/2026-03-10-ui-redesign-design.md` — Section 5: Admin Screens

**Prerequisite:** Phase 1 (Design System & Components) must be complete.

---

## Chunk 1: Navigation Restructure + Dashboard

### Task 1: Restructure Admin Tab Layout

**Files:**
- Modify: `apps/mobile/app/(admin)/_layout.tsx`

- [ ] **Step 1: Read the current admin layout**

Read `apps/mobile/app/(admin)/_layout.tsx` to understand current tab configuration and settings nesting.

- [ ] **Step 2: Remove Settings tab, keep 5 tabs**

Update the tab layout to have exactly 5 tabs:
1. Schedule (home icon) — this is the dashboard
2. Clients (users icon)
3. Packages (gift/package icon)
4. Billing (credit-card icon)
5. Reports (bar-chart icon)

Settings is no longer a tab. It will be accessed via gear icon on the Schedule screen, navigated to via `router.push("/(admin)/settings")`.

Ensure the Settings stack screens (class-types, rooms, general) still work as nested routes under `(admin)/settings/`.

- [ ] **Step 3: Verify navigation still works**

Boot app as admin. Verify 5 tabs render, Settings screens are accessible via direct navigation.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/(admin)/_layout.tsx
git commit -m "feat: restructure Admin tabs to 5 (remove Settings tab, add gear icon nav)"
```

---

### Task 2: Redesign Admin Dashboard/Schedule Tab

**Files:**
- Modify: `apps/mobile/app/(admin)/index.tsx`

- [ ] **Step 1: Read the current admin schedule screen**

Read `apps/mobile/app/(admin)/index.tsx`.

- [ ] **Step 2: Rewrite dashboard/schedule tab**

Layout (ScreenContainer with ScrollView):

1. **Header:** `XStack` with `ScreenTitle` "Dashboard" left, gear icon (`FontAwesome` "cog") right → `router.push("/(admin)/settings")`.

2. **Quick stats row:** `XStack` with 3 `StatCard`s (each flex 1, gap $2):
   - "Today's Sessions" with count, icon="calendar"
   - "Active Clients" with count, icon="users"
   - "This Month" with revenue formatted, icon="dollar"
   Data: aggregate from sessions + clients + billing APIs.

3. **Segmented control:** Day / Week / Month (same as Trainer).

4. **Day/Week/Month views:** Same as Trainer schedule (reuse shared components) BUT:
   - Session cards also show trainer name
   - Tap → opens **edit** sheet (not read-only)
   - Session edit sheet: `AppSheet` with editable fields:
     - Date/time picker
     - Trainer selector (dropdown/picker from trainers list)
     - Room selector
     - Capacity input
     - Status selector (active/cancelled)
     - "Save Changes" `Button` primary
     - "Cancel Session" `Button` danger at bottom

5. **FAB:** Green "+" → opens create session sheet:
   - Date/time picker
   - Class type selector (from class types API)
   - Trainer selector
   - Room selector
   - Capacity input (with default from class type)
   - Recurring toggle: when enabled, shows:
     - Repeat: Weekly (default)
     - End date picker
   - "Create Session" `Button` primary

- [ ] **Step 3: Verify dashboard**

Test stats rendering, all three view modes, create session, edit session.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/(admin)/index.tsx
git commit -m "feat: redesign Admin Dashboard with stats row, schedule views, create/edit session"
```

---

## Chunk 2: Clients + Packages Tabs

### Task 3: Redesign Admin Clients Tab

**Files:**
- Modify: `apps/mobile/app/(admin)/clients.tsx`

- [ ] **Step 1: Read the current admin clients screen**

Read `apps/mobile/app/(admin)/clients.tsx`.

- [ ] **Step 2: Rewrite clients tab**

Layout (ScreenContainer):

1. **Segmented control:** "Clients (34)" / "Invites (3)" — counts from API data.

2. **Clients view (when "Clients" segment active):**
   - Scrollable list of `GlassCard` interactive cards:
     - `XStack`: avatar circle (initials, 40x40) left
     - `YStack`: name (15px semibold), email (13px secondary), phone (12px tertiary)
     - Right side: `Badge` showing active package status:
       - Has active package with sessions: `Badge` success "12 sessions"
       - Package expiring within 7 days: `Badge` warning "Expiring soon"
       - No active package / expired: `Badge` danger "Expired" or "No package"
   - Tap → **Client detail sheet** (`AppSheet`):
     - Client info header (name, email, phone)
     - "Active Packages" section: list of packages with status, sessions, expiry
     - Actions: "Assign Package" `Button` secondary → opens assign package sub-sheet
     - "Pause Package" / "Resume Package" toggle button for active packages
     - "Recent Notes" section: last 3 trainer notes for this client
     - "Edit Client" `Button` ghost → opens edit form
   - Pull-to-refresh

3. **Invites view (when "Invites" segment active):**
   - List of `GlassCard` cards:
     - Email (15px), date sent (13px secondary)
     - `Badge` for status: Pending=info, Completed=success, Revoked=danger, Expired=warning
     - Action buttons: "Resend" (secondary, only for pending), "Revoke" (danger, only for pending)
   - Pull-to-refresh

4. **FAB:** "+" → `AppSheet` with two options:
   - "New Client" row (icon + label) → opens create client form sheet
   - "Send Invite" row (icon + label) → opens send invite form sheet
   - Create client form: name, email, phone inputs + "Create" button
   - Send invite form: email input + "Send Invite" button

- [ ] **Step 3: Verify both views**

Test clients list, client detail sheet, assign package, invites list, resend/revoke, create flows.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/(admin)/clients.tsx
git commit -m "feat: redesign Admin Clients tab with glass cards, detail sheets, invite management"
```

---

### Task 4: Redesign Admin Packages Tab

**Files:**
- Modify: `apps/mobile/app/(admin)/packages.tsx`

- [ ] **Step 1: Read the current admin packages screen**

Read `apps/mobile/app/(admin)/packages.tsx`.

- [ ] **Step 2: Rewrite packages tab**

Layout (ScreenContainer with ScrollView):

1. **Package Types section:**
   - `SectionHeader` "Package Types"
   - List of `GlassCard`s per package type:
     - Name (17px semibold)
     - `XStack` with info pills: "10 sessions" pill, "30 days" pill, "€50" pill (all using `Badge` neutral)
     - Tap → edit package type sheet: name, session count, validity days, price inputs + "Save" button
   - **FAB:** "+" → create new package type sheet

2. **Active Assignments section:**
   - `SectionHeader` "Active Assignments"
   - **Filter chips:** `XStack` of tappable chips: All, Expiring Soon, Expired. Active chip has green bg, others glass bg.
   - List of `GlassCard` size="sm" cards:
     - Client name (15px), package name (13px secondary)
     - "X/Y sessions remaining" text
     - "Expires [date]" + `Badge` for status
   - Pull-to-refresh

- [ ] **Step 3: Verify**

Test package type CRUD, filter chips, assignment list.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/(admin)/packages.tsx
git commit -m "feat: redesign Admin Packages tab with types, assignments, and filter chips"
```

---

## Chunk 3: Billing + Reports + Settings

### Task 5: Redesign Admin Billing Tab

**Files:**
- Modify: `apps/mobile/app/(admin)/billing.tsx`

- [ ] **Step 1: Read the current admin billing screen**

Read `apps/mobile/app/(admin)/billing.tsx`.

- [ ] **Step 2: Rewrite billing tab**

Layout (ScreenContainer with ScrollView):

1. **Period selector:** `XStack` centered with left arrow, "March 2026" text, right arrow. Arrows change month.

2. **Summary card:** `GlassCard` with:
   - `XStack` of 3 stat columns (flex 1 each):
     - "Revenue" + "€2,400" (large green text)
     - "Transactions" + "18"
     - "Avg/Client" + "€141"

3. **Transaction list:**
   - `SectionHeader` "Transactions"
   - List of `GlassCard` size="sm" interactive cards:
     - `XStack`: left = client name (15px) + package name below (13px secondary). Right = amount "€50" (15px semibold) + date below (12px tertiary)
     - `Badge` for payment status (Paid=success, Pending=warning, Failed=danger)
     - Tap → transaction detail sheet with full info

4. Pull-to-refresh

- [ ] **Step 3: Verify**

Check period navigation, summary updates, transaction list renders.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/(admin)/billing.tsx
git commit -m "feat: redesign Admin Billing tab with period selector, summary, and transactions"
```

---

### Task 6: Redesign Admin Reports Tab

**Files:**
- Modify: `apps/mobile/app/(admin)/reports.tsx`

- [ ] **Step 1: Read the current admin reports screen**

Read `apps/mobile/app/(admin)/reports.tsx`.

- [ ] **Step 2: Rewrite reports tab**

Layout (ScreenContainer with ScrollView):

1. **Period selector:** `SegmentedControl` with "This Week", "This Month", "Custom". Custom shows date range picker.

2. **Stat cards grid:** 2x2 grid using `XStack` + wrap:
   - "Sessions Held" `StatCard` with icon="calendar"
   - "Attendance Rate" `StatCard` with icon="check-circle" (show as percentage)
   - "New Clients" `StatCard` with icon="user-plus"
   - "Revenue" `StatCard` with icon="dollar"

3. **Attendance chart:** Using `victory-native`:
   - `VictoryChart` with `VictoryBar` showing sessions scheduled vs attended per day/week
   - Dark theme: dark background, green bars for attended, grey/glass bars for scheduled
   - Chart container: `GlassCard`
   - Keep it simple: bar chart only, no complex interactions

   ```tsx
   import { VictoryBar, VictoryChart, VictoryAxis, VictoryGroup } from "victory-native";
   ```

   Style the chart:
   - Axis labels in secondary text color
   - Grid lines in very subtle (rgba(255,255,255,0.04))
   - Bar colors: scheduled = rgba(255,255,255,0.1), attended = #2e5b42

4. **Popular classes:** `SectionHeader` "Popular Classes" → ranked list of `GlassCard` size="sm":
   - Rank number (large, accent color), class name, booking count badge

5. **Trainer utilization:** `SectionHeader` "Trainer Utilization" → list of `GlassCard` size="sm":
   - Trainer name, sessions count, average fill rate as percentage + small progress bar

- [ ] **Step 3: Verify chart renders**

Victory-native can be tricky. Test that the bar chart renders without crashes on iOS. Test with mock data if API doesn't return enough data.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/(admin)/reports.tsx
git commit -m "feat: redesign Admin Reports tab with stat grid, victory-native chart, rankings"
```

---

### Task 7: Redesign Admin Settings Sub-Screen

**Files:**
- Modify: `apps/mobile/app/(admin)/settings/index.tsx`
- Modify: `apps/mobile/app/(admin)/settings/class-types.tsx`
- Modify: `apps/mobile/app/(admin)/settings/rooms.tsx`

- [ ] **Step 1: Read all three settings screens**

Read `apps/mobile/app/(admin)/settings/index.tsx`, `class-types.tsx`, and `rooms.tsx`.

- [ ] **Step 2: Redesign settings index**

Layout (ScreenContainer with ScrollView):

- Back arrow top-left → `router.back()`
- `ScreenTitle` "Settings"

Grouped sections using `GlassCard`:

**Studio section:**
- "Class Types" row: icon="tag", label, count badge, chevron → navigates to class-types
- "Rooms" row: icon="home", label, count badge, chevron → navigates to rooms
- "General" row: icon="sliders", label, chevron → opens general settings sheet

**General settings sheet** (`AppSheet`):
- `SectionHeader` "General Settings"
- `Input` with `label="Studio Name"` — pre-filled from current studio data, editable
- Timezone picker: `GlassCard` interactive row showing current timezone value (e.g., "Europe/Belgrade"), chevron → opens timezone selection list (searchable list of IANA timezones, or a curated subset of common ones). Selected timezone updates the row.
- `SectionHeader` "Notification Defaults" — these are studio-wide defaults for new clients:
  - "Booking confirmations" toggle row (Switch, default on)
  - "Session reminders" toggle row (Switch, default on)
  - "Cancellation alerts" toggle row (Switch, default on)
- "Save Changes" `Button` primary at bottom — calls update studio settings API
- On success: dismiss sheet, show success toast

**Account section:**
- "Admin Profile" row: icon="user", shows name + email, chevron → could edit in future
- "Sign Out" row: icon="sign-out", danger colored → calls sign-out API

Each row is a `XStack` within the `GlassCard` with: icon, label, right content (badge/chevron/value), `Pressable` wrapper.

- [ ] **Step 3: Redesign class-types screen**

- Back arrow + `ScreenTitle` "Class Types"
- List of `GlassCard` size="sm" interactive:
  - Colored dot (left, 8x8 circle with class type color), name, default duration, default capacity
  - Tap → edit sheet with name, duration, capacity, color picker (simple preset colors)
- FAB "+" → create class type sheet

- [ ] **Step 4: Redesign rooms screen**

- Back arrow + `ScreenTitle` "Rooms"
- List of `GlassCard` size="sm" interactive:
  - Room name, capacity badge
  - Tap → edit sheet with name, capacity inputs
- FAB "+" → create room sheet

- [ ] **Step 5: Verify all settings screens**

Navigate through settings → class types, settings → rooms. Test CRUD operations.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/(admin)/settings/
git commit -m "feat: redesign Admin Settings with glass cards, class types, and rooms management"
```

---

## Summary

After Phase 5, the admin experience is fully redesigned:
- **5 tabs** (Settings removed from tab bar → gear icon navigation)
- **Dashboard/Schedule:** Stats row, day/week/month views, create/edit session
- **Clients:** Segmented clients/invites, detail sheets, assign package, create/invite
- **Packages:** Package types CRUD, active assignments with filter chips
- **Billing:** Period selector, summary card, transaction list
- **Reports:** Stat grid, victory-native bar chart, popular classes, trainer utilization
- **Settings:** Stack screen with class types, rooms, general, account
