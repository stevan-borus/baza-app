# Phase 3: Client Screens — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign all client-facing screens: Home dashboard (with onboarding checklist), Calendar (week strip + day view + booking flow), Notifications, and new Profile tab.

**Architecture:** Client tab layout expanded from 3 to 4 tabs (adding Profile). Each screen uses Phase 1 components (GlassCard, WeekStrip, SessionCard, ProgressRing, etc.). Home tab is a vertical ScrollView of card sections. Calendar uses WeekStrip + day session list. Booking uses AppSheet with two-step confirmation.

**Tech Stack:** Tamagui, Expo Router, TanStack Query, AsyncStorage (onboarding), Phase 1 components

**Spec reference:** `docs/superpowers/specs/2026-03-10-ui-redesign-design.md` — Section 3: Client Screens + Section 6: Onboarding Checklist

**Prerequisite:** Phase 1 (Design System & Components) must be complete.

---

## Chunk 1: Tab Layout + Profile Tab

### Task 1: Update Client Layout — Add Profile Tab

**Files:**
- Modify: `apps/mobile/app/(client)/_layout.tsx`

- [ ] **Step 1: Read the current client layout**

Read `apps/mobile/app/(client)/_layout.tsx` to understand the current tab configuration.

- [ ] **Step 2: Add Profile as 4th tab**

Add a new tab entry for "Profile" with a person icon (`user` from FontAwesome). Tab order: Home, Calendar, Notifications, Profile.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/(client)/_layout.tsx
git commit -m "feat: add Profile as 4th client tab"
```

---

### Task 2: Create Profile Tab Screen

**Files:**
- Create: `apps/mobile/app/(client)/profile.tsx`

- [ ] **Step 1: Create the profile screen**

Layout (ScrollView inside ScreenContainer):

1. **Header area:** Centered avatar circle (60x60, dark glass bg, initials from user name in white), name below, email below that
2. **My Packages section:** `SectionHeader` "My Packages" → list of all assigned packages. Each is a `GlassCard` showing: package name, `Badge` for status (active=success, paused=warning, expired=danger), "X/Y sessions" text, "Expires [date]" in tertiary text. Data from existing client packages API.
3. **Training History section:** `SectionHeader` "Training History" → list of recent past sessions. Each is a `ListRow` with class name as title, date + trainer as subtitle. Data from bookings API filtered to past.
4. **Preferences section:** `SectionHeader` "Preferences" → `GlassCard` containing:
   - Language row: label "Language", current language value, chevron → opens language picker
   - Notifications row: label "Notification Settings", chevron → opens notification preferences sheet (reuse from Notifications tab)
5. **Account section:** `SectionHeader` "Account" → `Button` variant="danger" "Sign Out" that calls sign-out API

Pull-to-refresh on the ScrollView triggers refetch of packages and history.

- [ ] **Step 2: Wire up data fetching**

Use existing TanStack Query hooks for:
- User session data (name, email) — already available from `useSessionAuth()`
- Client packages — use existing query or create one hitting the packages endpoint
- Booking history — use existing bookings query filtered to past dates

- [ ] **Step 3: Verify Profile tab works**

Boot app, sign in as client, navigate to Profile tab. Verify all sections render, data loads, sign-out works.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/(client)/profile.tsx
git commit -m "feat: add client Profile tab with packages, history, preferences, sign-out"
```

---

## Chunk 2: Home Tab Redesign

### Task 3: Create Onboarding Checklist Component

**Files:**
- Create: `apps/mobile/components/client/onboarding-checklist.tsx`

- [ ] **Step 1: Create onboarding checklist**

Uses AsyncStorage to track completion state. Checks existing data for auto-completion.

```
Key: `baza_onboarding_${userId}`
Value: JSON { profileCompleted, notificationsConfigured, firstClassBooked, dismissed }
```

Component reads from AsyncStorage on mount. Auto-detects:
- `profileCompleted` → true if user name is set (from session data passed as prop)
- `firstClassBooked` → true if bookings count > 0 (passed as prop)
- `notificationsConfigured` → stored in AsyncStorage, set true when user visits notification settings

If all complete OR dismissed, returns null (renders nothing).

Layout:
- `GlassCard` with:
  - "Get Started" heading (17px semibold)
  - Horizontal progress bar: `XStack` with green fill proportional to completed items
  - 3 rows, each: icon (FontAwesome), label text, right side = green checkmark if done or chevron if not. Dimmed if done.
  - Tapping incomplete item calls `onNavigate(target)` prop (parent handles navigation)
- When all 3 done: card content changes to "You're all set!" with a "Dismiss" `Button` variant="ghost"
- Dismiss sets `dismissed: true` in AsyncStorage

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/components/client/onboarding-checklist.tsx
git commit -m "feat: add onboarding checklist component with AsyncStorage persistence"
```

---

### Task 4: Redesign Client Home Tab

**Files:**
- Modify: `apps/mobile/app/(client)/index.tsx`

- [ ] **Step 1: Read the current client home screen**

Read `apps/mobile/app/(client)/index.tsx` to understand current data fetching and layout.

- [ ] **Step 2: Rewrite home tab**

Layout (ScrollView inside ScreenContainer):

1. **Greeting row:** `XStack` with left side = "Hello, [First Name]" (`ScreenTitle` at smaller size, 24px) + date below in secondary text. Right side = notification bell icon (`FontAwesome` "bell") with unread count badge (small red circle with number). Bell taps navigate to Notifications tab.

2. **Next class card:** Query upcoming bookings. If exists, render `GlassCard` with `accentBorder="left"`:
   - Class name (17px semibold)
   - Trainer name (secondary text)
   - Relative time: "Today at 10:00 AM" or "Tomorrow at 2:00 PM" (use dayjs)
   - Room name (tertiary text)
   - Tap navigates to Calendar tab with that date selected

   If no upcoming: `GlassCard` with "No upcoming classes" text + `Button` "Browse schedule" that navigates to Calendar tab.

3. **Weekly activity strip:** `WeekStrip` component from Phase 1. Pass `activityByDate` computed from this week's bookings (booked = "booked", sessions available = "available").

4. **Package summary card:** `GlassCard` containing:
   - `XStack` with `ProgressRing` on the left (sessions used / total as progress)
   - Right side: "X sessions remaining" large text, "Expires [date]" subtitle
   - If multiple packages: horizontal `ScrollView` of package cards
   - If no package: "No active package" with "Contact studio" text

5. **Onboarding checklist:** `<OnboardingChecklist>` component. Pass user data and booking count. Only shows for new clients.

6. **Recent trainer notes:** `SectionHeader` "Recent Notes" with "See all" `LinkText`. Last 2-3 notes as compact `GlassCard`s: trainer name bold, note text preview (2 lines), date tertiary. Tap to expand (or navigate to a notes view).

Pull-to-refresh on ScrollView refetches all queries.

- [ ] **Step 3: Remove sign-out and language switcher from Home**

These moved to Profile tab. Remove them from Home.

- [ ] **Step 4: Verify home tab**

Boot app, sign in as client. Verify all cards render, data loads, navigation works. Test empty states (no bookings, no package, no notes).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/(client)/index.tsx
git commit -m "feat: redesign client Home tab with next class, week strip, package ring, onboarding"
```

---

## Chunk 3: Calendar Tab Redesign

### Task 5: Redesign Calendar Tab with WeekStrip + Day View

**Files:**
- Modify: `apps/mobile/app/(client)/calendar.tsx`

- [ ] **Step 1: Read the current calendar screen**

Read `apps/mobile/app/(client)/calendar.tsx` to understand current data fetching, booking logic, and sheet interactions.

- [ ] **Step 2: Rewrite calendar tab**

Layout (ScreenContainer):

1. **Month/year header:** `XStack` with left arrow, "March 2026" center text (17px semibold), right arrow. Arrows navigate months. Tapping the month text could scroll the week strip.

2. **Week strip:** `WeekStrip` component. `selectedDate` is local state. `activityByDate` computed from sessions API for the visible week. `onSelectDate` updates selectedDate.

3. **Day session list:** Below the week strip. `SectionHeader` showing the selected day formatted ("Monday, March 10"). Below: list of `SessionCard` components for that day's sessions. If no sessions: `EmptyState` with `icon="calendar"` and "No classes on this day".

4. **Session detail sheet:** When a `SessionCard` is tapped, open `AppSheet` with:
   - Class name heading (20px semibold)
   - Info rows (icon + label + value pattern):
     - Clock icon: date + time
     - Timer icon: duration
     - Map-pin icon: room name
     - User icon: trainer name
     - Users icon: capacity ("3/8 spots available" or "Full — 2 on waitlist")
   - **Booking actions** (conditional):
     - If available + has package: "Book session" `Button` primary → on tap, show confirmation state
     - Confirmation state: "Confirm booking?" text + "This will use 1 of your X remaining sessions" + "Confirm" `Button` primary + "Cancel" `LinkText`
     - If already booked: show "Booked" `Badge` success + "Cancel booking" `Button` danger. Cancellation shows warning about policy.
     - If full + not waitlisted: "Join waitlist" `Button` variant="secondary" with amber styling
     - If waitlisted: "Waitlisted (position #N)" `Badge` warning + "Leave waitlist" `Button` danger
     - If no active package: "No active package" text, no booking button
   - Use `expo-haptics` for light impact on successful book/cancel

Data: Fetch sessions for the selected date range. When date changes, fetch that day's sessions. Use TanStack Query with the date as a key.

- [ ] **Step 3: Remove old BigCalendar month view from this screen**

The client calendar now uses WeekStrip + day list. Remove the `react-native-big-calendar` usage from this screen (it's retained for Trainer/Admin month views only).

- [ ] **Step 4: Verify calendar flow**

Test:
- Navigate between days via week strip
- Navigate between weeks/months via arrows
- Tap session → sheet opens with correct info
- Book a session → confirmation step → success
- Cancel a booking → warning → success
- Full session shows waitlist option
- Empty days show empty state

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/(client)/calendar.tsx
git commit -m "feat: redesign client Calendar with WeekStrip, day view, and two-step booking"
```

---

## Chunk 4: Notifications Tab Restyle

### Task 6: Restyle Notifications Tab

**Files:**
- Modify: `apps/mobile/app/(client)/notifications.tsx`

- [ ] **Step 1: Read the current notifications screen**

Read `apps/mobile/app/(client)/notifications.tsx` to understand current layout and data fetching.

- [ ] **Step 2: Restyle with glass components**

Keep existing data fetching and logic. Replace the JSX:

- `ScreenContainer` wrapper
- Header: `XStack` with `ScreenTitle` "Notifications" left, gear icon (`FontAwesome` "cog") right → opens notification preferences sheet
- Notification list: `LegendList` (keep existing infinite scroll). Each item is a `GlassCard`:
  - `accentBorder="left"` with green color if unread, no accent if read
  - Top row: `Badge` for type (Booking=success, Session Update=info, Trainer Note=warning, General=neutral) + timestamp right-aligned in tertiary text
  - Body: notification message text
  - Tap to mark as read
- Empty state: `EmptyState` with `icon="bell"` and "No notifications yet"
- Pull-to-refresh

- [ ] **Step 3: Restyle notification preferences sheet**

The settings sheet (opened by gear icon) should use glass-styled components:
- `AppSheet` wrapper
- `SectionHeader` "Notification Preferences"
- Toggle rows for each preference (push notifications, in-app, marketing). Each row: label text left, switch/toggle right. Use a native `Switch` component with `trackColor` set to accent green when enabled.

- [ ] **Step 4: Verify**

Check notifications render, unread highlighting works, preferences sheet opens and saves.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/(client)/notifications.tsx
git commit -m "feat: restyle Notifications tab with glass cards and accent borders"
```

---

## Summary

After Phase 3, the client experience is fully redesigned:
- **4 tabs:** Home, Calendar, Notifications, Profile
- **Home:** Greeting, next class, week strip, package ring, onboarding checklist, recent notes
- **Calendar:** Week strip, day view with SessionCards, two-step booking flow with cancellation policy
- **Notifications:** Glass cards with unread accent, type badges, preferences sheet
- **Profile:** Packages, history, preferences, sign-out (moved from Home)
