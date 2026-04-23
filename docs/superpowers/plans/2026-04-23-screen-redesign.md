# Screen Redesign Plan (Post-Uniwind)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign every screen in the mobile app to feel silky-smooth and on par with best-in-class studio booking apps (Mindbody-tier). Raise visual hierarchy, introduce card tiers, replace the list-based day view with a real time-axis calendar, and add motion throughout.

**Architecture:** Each screen targets 3–6 specific Mobbin screenshots as design reference, pulled from `docs/inspiration/`. For each screen we: (1) pick and note the specific reference images, (2) re-compose the screen with the right hierarchy (hero card / section header / list row / stat tile), (3) wire motion (Moti for mount + sheet + WeekStrip selection; haptics on key interactions), (4) verify visually against the references. Styles use Uniwind classes. Each screen is a separate commit so we can revert individually.

**Tech Stack:** Uniwind, Moti, @gorhom/bottom-sheet, Reanimated 4, expo-blur, expo-haptics, react-native-svg, victory-native. Assumes the Uniwind migration (`2026-04-23-uniwind-migration.md`) is complete and the app runs on Uniwind with zero visual regressions.

**Working directory:** `/Users/stevanborus/Desktop/baza-app/.claude/worktrees/new-ui`

**Inspiration root:** `/Users/stevanborus/Desktop/baza-app/docs/inspiration/`

---

## Ground rules for every screen

1. **Sample 3–6 Mobbin images per screen.** Open them, find the specific patterns we're copying (spacing rhythm, card hierarchy, typography contrast, motion cues), and document the chosen frame paths in the task step before writing code. Do not attempt to study every screenshot in a folder.
2. **Commit reference choices in the code as a comment block at the top of each screen file** listing the exact image paths we studied. This locks in the design intent and makes future tweaks traceable.
3. **Motion budget per screen:**
   - Mount: MotiView stagger (opacity + translateY) on top-level sections, 300–500ms total
   - Card press: `active:opacity-80 active:scale-[0.98]`
   - List item tap → sheet: haptic `Light` on trigger, sheet spring via gorhom default
   - Pull-to-refresh: standard iOS/Android indicator, accent tint
   - Number rollups (stats): Moti `from={{ opacity: 0 }} animate={{ opacity: 1 }}` with 80ms stagger
4. **Card tiers** (new):
   - **HeroCard** — `p-6 rounded-[28px]` + inner gradient overlay, used for "Next class", "Active package", admin "Revenue this month"
   - **GlassCard** (existing) — `p-4 rounded-[20px]`, list rows + secondary sections
   - **StatTile** — `p-4 rounded-2xl`, dense numeric card for admin dashboard grids
5. **Spacing rhythm:** screens use a 24px horizontal gutter (`px-6`), sections separated by 24–32px (`gap-6` or `gap-8`) with `SectionLabel` above each group. Within a section, elements use `gap-3`.
6. **Typography contrast:** hero numbers 40–48px bold (`text-[44px] font-bold`), titles 28px bold, section labels 11px uppercase muted. We currently under-use large numbers — the redesign leans on them as a hierarchy anchor.
7. **Drop Peloton from references.** Pelton's content-feed styling doesn't fit a booking app.

---

## File Structure

### New primitives (to create)

- `apps/mobile/components/ui/hero-card.tsx` — HeroCard variant with inner gradient
- `apps/mobile/components/ui/stat-tile.tsx` — StatTile (label + big number + trend chip)
- `apps/mobile/components/ui/time-axis-day-view.tsx` — the real calendar component (vertical time axis + positioned session blocks)
- `apps/mobile/components/ui/segmented-control.tsx` — proper segmented control for Day/Week/Month + admin tab filters (current `tabs.tsx` is okay but gets restyled)
- `apps/mobile/components/ui/metric-row.tsx` — key/value row used across profile, billing, reports
- `apps/mobile/components/ui/number-rollup.tsx` — animated number counter for stat hero sections

### Screens to redesign (in order)

1. `app/(client)/calendar.tsx` — day-view time axis is the single biggest visual unlock
2. `app/(client)/index.tsx` — client Home
3. Booking sheet (lives inside `calendar.tsx` but treated separately)
4. `app/(admin)/index.tsx` — admin Schedule/Dashboard
5. `app/(admin)/billing.tsx`
6. `app/(admin)/reports.tsx`
7. `app/(admin)/clients.tsx`
8. `app/(admin)/packages.tsx`
9. `app/(admin)/settings/*`
10. `app/(trainer)/index.tsx` — trainer Schedule
11. `app/(trainer)/clients.tsx`
12. `app/(trainer)/notes.tsx`
13. `app/(client)/notifications.tsx`
14. `app/(client)/profile.tsx`
15. `app/sign-in.tsx` — Auth sign-in
16. `app/reset-password.tsx` — Auth reset
17. `app/accept-invite.tsx` — Auth invite acceptance

---

## Task 1: Build new primitives (HeroCard, StatTile, MetricRow, NumberRollup, SegmentedControl)

**Files:**
- Create: `apps/mobile/components/ui/hero-card.tsx`
- Create: `apps/mobile/components/ui/stat-tile.tsx`
- Create: `apps/mobile/components/ui/metric-row.tsx`
- Create: `apps/mobile/components/ui/number-rollup.tsx`
- Create: `apps/mobile/components/ui/segmented-control.tsx`

- [ ] **Step 1: HeroCard**

Write `apps/mobile/components/ui/hero-card.tsx`:
```tsx
import React from "react";
import { Platform, View, type ViewProps } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";

type HeroCardProps = ViewProps & {
  tone?: "default" | "accent" | "warning";
  children?: React.ReactNode;
};

const gradients: Record<NonNullable<HeroCardProps["tone"]>, [string, string]> = {
  default: ["rgba(255,255,255,0.08)", "rgba(255,255,255,0.02)"],
  accent: ["rgba(46,91,66,0.45)", "rgba(46,91,66,0.15)"],
  warning: ["rgba(245,158,11,0.35)", "rgba(245,158,11,0.05)"],
};

export function HeroCard({ tone = "default", className, children, style, ...rest }: HeroCardProps) {
  const isIOS = Platform.OS === "ios";
  return (
    <View
      className={`rounded-[28px] overflow-hidden border border-glass-border ${className ?? ""}`}
      style={style}
      {...rest}
    >
      {isIOS ? (
        <BlurView intensity={50} tint="dark" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
      ) : (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(20,25,30,0.95)" }} />
      )}
      <LinearGradient
        colors={gradients[tone]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <View className="p-6">{children}</View>
    </View>
  );
}
```

- [ ] **Step 2: StatTile**

Write `apps/mobile/components/ui/stat-tile.tsx`:
```tsx
import React from "react";
import { Text, View } from "react-native";
import { GlassCard } from "./glass-card";

type StatTileProps = {
  label: string;
  value: string | number;
  delta?: { value: string; positive?: boolean };
  icon?: React.ReactNode;
};

export function StatTile({ label, value, delta, icon }: StatTileProps) {
  return (
    <GlassCard size="sm">
      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-xs font-semibold text-muted uppercase tracking-wider">
            {label}
          </Text>
          {icon}
        </View>
        <Text className="text-[28px] font-bold text-foreground tracking-tight">
          {value}
        </Text>
        {delta ? (
          <Text
            className={`text-xs font-semibold ${
              delta.positive ? "text-success" : "text-danger"
            }`}
          >
            {delta.positive ? "▲" : "▼"} {delta.value}
          </Text>
        ) : null}
      </View>
    </GlassCard>
  );
}
```

- [ ] **Step 3: MetricRow**

Write `apps/mobile/components/ui/metric-row.tsx`:
```tsx
import React from "react";
import { Text, View } from "react-native";

type Props = {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
};

export function MetricRow({ label, value, icon }: Props) {
  return (
    <View className="flex-row items-center justify-between py-3 border-b border-glass-border">
      <View className="flex-row items-center gap-3">
        {icon}
        <Text className="text-muted text-sm">{label}</Text>
      </View>
      <Text className="text-foreground font-medium text-sm">{value}</Text>
    </View>
  );
}
```

- [ ] **Step 4: NumberRollup**

Write `apps/mobile/components/ui/number-rollup.tsx`:
```tsx
import React, { useEffect, useState } from "react";
import { Text, type TextProps } from "react-native";

type Props = TextProps & {
  value: number;
  durationMs?: number;
  formatter?: (n: number) => string;
};

export function NumberRollup({
  value,
  durationMs = 600,
  formatter = (n) => String(Math.round(n)),
  className,
  ...rest
}: Props) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const from = display;
    const to = value;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return (
    <Text className={className} {...rest}>
      {formatter(display)}
    </Text>
  );
}
```

- [ ] **Step 5: SegmentedControl**

Write `apps/mobile/components/ui/segmented-control.tsx`:
```tsx
import React from "react";
import { Pressable, Text, View } from "react-native";
import { MotiView } from "moti";

type Props<T extends string> = {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

export function SegmentedControl<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <View className="flex-row bg-glass border border-glass-border rounded-2xl p-1">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            className="flex-1 py-2 rounded-xl relative items-center"
          >
            {active ? (
              <MotiView
                from={{ opacity: 0.3 }}
                animate={{ opacity: 1 }}
                transition={{ type: "timing", duration: 180 }}
                className="absolute inset-0 bg-accent rounded-xl"
              />
            ) : null}
            <Text
              className={`text-sm font-semibold ${
                active ? "text-white" : "text-muted"
              }`}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/components/ui/hero-card.tsx apps/mobile/components/ui/stat-tile.tsx apps/mobile/components/ui/metric-row.tsx apps/mobile/components/ui/number-rollup.tsx apps/mobile/components/ui/segmented-control.tsx
git commit -m "feat(ui): add HeroCard, StatTile, MetricRow, NumberRollup, SegmentedControl"
```

---

## Task 2: Build TimeAxisDayView

**Files:**
- Create: `apps/mobile/components/ui/time-axis-day-view.tsx`
- Test: `apps/mobile/components/__tests__/time-axis-day-view.test.tsx`

**References:**
- `docs/inspiration/Google Calendar ios May 2021/` — sample 4 images showing day view with time axis (open first 40 images, pick ones with a single day view visible)
- `docs/inspiration/Fresha ios Oct 2024/` — sample 3 images of studio day/slot view

**Design:** Vertical scroll. Left gutter has hour labels (`6 AM`, `7 AM`, … `10 PM`). Each hour is 60px tall. Sessions are absolutely positioned rectangles with `top = (startMinutes - 6*60) * px_per_minute`, `height = durationMinutes * px_per_minute`. Current-time red line across if today. Class-type colored left bar inside each block. Tap → session detail sheet.

- [ ] **Step 1: Write failing unit test for position math**

Write `apps/mobile/components/__tests__/time-axis-day-view.test.tsx`:
```tsx
import { sessionBlockPosition, HOUR_START, PX_PER_MINUTE } from "@/components/ui/time-axis-day-view";

describe("sessionBlockPosition", () => {
  it("places 6am session at top 0", () => {
    const { top, height } = sessionBlockPosition({
      startsAt: "2026-04-23T06:00:00.000Z",
      endsAt: "2026-04-23T07:00:00.000Z",
    });
    expect(top).toBe(0);
    expect(height).toBe(60 * PX_PER_MINUTE);
  });

  it("places 10am session at top = (10-6)*60*px", () => {
    const { top } = sessionBlockPosition({
      startsAt: "2026-04-23T10:30:00.000Z",
      endsAt: "2026-04-23T11:30:00.000Z",
    });
    expect(top).toBe((4 * 60 + 30) * PX_PER_MINUTE);
  });

  it("clamps sessions starting before HOUR_START to top 0 with shortened height", () => {
    const { top, height } = sessionBlockPosition({
      startsAt: "2026-04-23T05:30:00.000Z",
      endsAt: "2026-04-23T06:30:00.000Z",
    });
    expect(top).toBe(0);
    expect(height).toBe(30 * PX_PER_MINUTE);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run from `apps/mobile/`:
```bash
pnpm jest time-axis-day-view
```

Expected: FAIL with "Cannot find module '@/components/ui/time-axis-day-view'".

- [ ] **Step 3: Implement `time-axis-day-view.tsx` with just the math + exports**

Write `apps/mobile/components/ui/time-axis-day-view.tsx`:
```tsx
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import dayjs from "dayjs";

export const HOUR_START = 6;  // 6 AM
export const HOUR_END = 22;   // 10 PM
export const PX_PER_MINUTE = 1; // 60px per hour
const HOUR_HEIGHT = 60 * PX_PER_MINUTE;

type SessionBlock = {
  id: string;
  startsAt: string;
  endsAt: string;
  classTypeName: string;
  roomName?: string | null;
  bookedCount: number;
  capacity: number;
  status?: "available" | "full" | "booked";
};

export function sessionBlockPosition(s: { startsAt: string; endsAt: string }) {
  const start = dayjs(s.startsAt);
  const end = dayjs(s.endsAt);
  const startMinutes = Math.max(0, start.hour() * 60 + start.minute() - HOUR_START * 60);
  const endMinutes = Math.min((HOUR_END - HOUR_START) * 60, end.hour() * 60 + end.minute() - HOUR_START * 60);
  return {
    top: startMinutes * PX_PER_MINUTE,
    height: Math.max(24, (endMinutes - startMinutes) * PX_PER_MINUTE),
  };
}

const classTypeColors: Record<string, string> = {
  Pilates: "#2e5b42",
  Yoga: "#2dd4bf",
  HIIT: "#f87171",
};

type Props = {
  date: string;
  sessions: SessionBlock[];
  onSessionPress: (s: SessionBlock) => void;
  showNowLine?: boolean;
};

export function TimeAxisDayView({ date, sessions, onSessionPress, showNowLine }: Props) {
  const now = dayjs();
  const isToday = now.format("YYYY-MM-DD") === date;
  const nowTop =
    isToday && showNowLine
      ? Math.max(0, now.hour() * 60 + now.minute() - HOUR_START * 60) * PX_PER_MINUTE
      : null;

  const hours: number[] = [];
  for (let h = HOUR_START; h <= HOUR_END; h++) hours.push(h);

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
    >
      <View className="flex-row pt-2">
        {/* Hour gutter */}
        <View style={{ width: 56 }}>
          {hours.map((h) => (
            <View key={h} style={{ height: HOUR_HEIGHT, justifyContent: "flex-start" }}>
              <Text className="text-xs text-muted pl-6 -mt-1.5">
                {h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`}
              </Text>
            </View>
          ))}
        </View>
        {/* Track */}
        <View className="flex-1 relative pr-6" style={{ height: (HOUR_END - HOUR_START) * HOUR_HEIGHT }}>
          {/* hour lines */}
          {hours.map((h, i) => (
            <View
              key={h}
              className="absolute left-0 right-0 border-t border-glass-border"
              style={{ top: i * HOUR_HEIGHT }}
            />
          ))}

          {/* sessions */}
          {sessions.map((s) => {
            const { top, height } = sessionBlockPosition(s);
            const color = classTypeColors[s.classTypeName] ?? "#2e5b42";
            return (
              <Pressable
                key={s.id}
                onPress={() => onSessionPress(s)}
                className="absolute left-0 right-0 active:opacity-80"
                style={{ top, height }}
              >
                <View
                  className="flex-1 rounded-xl overflow-hidden border border-glass-border bg-glass"
                  style={{ borderLeftWidth: 3, borderLeftColor: color }}
                >
                  <View className="p-2 gap-0.5">
                    <Text className="text-foreground font-semibold text-sm" numberOfLines={1}>
                      {s.classTypeName}
                    </Text>
                    <Text className="text-muted text-xs" numberOfLines={1}>
                      {dayjs(s.startsAt).format("HH:mm")}–{dayjs(s.endsAt).format("HH:mm")}
                      {s.roomName ? ` · ${s.roomName}` : ""}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}

          {/* now line */}
          {nowTop !== null ? (
            <View
              className="absolute left-0 right-0 flex-row items-center"
              style={{ top: nowTop }}
            >
              <View className="w-2 h-2 rounded-full bg-danger -ml-1" />
              <View className="flex-1 h-[1px] bg-danger" />
            </View>
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}
```

- [ ] **Step 4: Run the test again**

Run from `apps/mobile/`:
```bash
pnpm jest time-axis-day-view
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/components/ui/time-axis-day-view.tsx apps/mobile/components/__tests__/time-axis-day-view.test.tsx
git commit -m "feat(ui): add TimeAxisDayView with positioned session blocks and now-line"
```

---

## Task 3: Redesign client calendar (`app/(client)/calendar.tsx`)

**Files:**
- Modify: `apps/mobile/app/(client)/calendar.tsx`

**References:**
- Open 4 images from `docs/inspiration/Google Calendar ios May 2021/` (look for day view frames, skip month/search screens)
- Open 3 images from `docs/inspiration/Fresha ios Oct 2024/` (look for studio day view with slots)

- [ ] **Step 1: Study references, pick 5–7 specific image paths, and write them as a comment block at the top of the new file**

Format the comment:
```tsx
/**
 * Design references:
 * - Google Calendar ios May 2021/Google Calendar ios May 2021 <N>.png  // time-axis day view
 * - Google Calendar ios May 2021/Google Calendar ios May 2021 <N>.png  // event block styling
 * - Fresha ios Oct 2024/Fresha ios Oct 2024 <N>.png                    // studio day slot density
 * - Fresha ios Oct 2024/Fresha ios Oct 2024 <N>.png                    // "full" slot treatment
 */
```

- [ ] **Step 2: Rewrite the calendar screen using TimeAxisDayView**

Replace the current list-of-SessionCards with the new time-axis view. Keep the WeekStrip at top, keep the booking sheet logic, keep month navigation. Structure:

```tsx
// calendar.tsx structure:
<ScreenContainerRaw>
  <MotiView from={{ opacity: 0, translateY: -8 }} animate={{ opacity: 1, translateY: 0 }}>
    <Header>  {/* Month + chevrons */}
      <ScreenTitle>{monthDisplay}</ScreenTitle>
      <MonthNavArrows />
    </Header>
    <WeekStrip ... />
  </MotiView>

  <View className="px-6 pb-2">
    <SectionLabel>{t("client.calendar.today")} · {daySessions.length} classes</SectionLabel>
  </View>

  {daySessions.length === 0 ? (
    <EmptyState ... />
  ) : (
    <TimeAxisDayView
      date={selectedDate}
      sessions={daySessions}
      onSessionPress={handleSessionPress}
      showNowLine
    />
  )}

  <BookingSheet ... />  {/* extracted to task 4 */}
</ScreenContainerRaw>
```

Motion: MotiView mounting wrapping the header (fade+slide 350ms), `TimeAxisDayView` renders immediately (scroll position set to 8 AM on first mount).

Haptics: `Haptics.selectionAsync()` when the user taps a day pill in WeekStrip (add to WeekStrip onPress).

- [ ] **Step 3: Verify in the simulator**

Run the app. Confirm:
- Day view renders with hour labels on the left and session blocks on the right
- Tapping a session opens the booking sheet
- Swiping left-right on the WeekStrip switches days (current behavior)
- Now-line appears on today

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/\(client\)/calendar.tsx
git commit -m "feat(client): replace day-list with time-axis calendar view"
```

---

## Task 4: Redesign booking sheet

**Files:**
- Modify: `apps/mobile/app/(client)/calendar.tsx` (extract sheet to a component)
- Create: `apps/mobile/components/client/booking-sheet.tsx`

**References:**
- `docs/inspiration/Fresha ios Oct 2024/` — pick 4 images showing service detail → confirm → success (sequence)
- `docs/inspiration/ClassPass ios May 2022/` — pick 3 images showing studio class booking sheet

- [ ] **Step 1: Pick the specific images and list them at top of booking-sheet.tsx as a comment**

- [ ] **Step 2: Extract the sheet content into a new file**

Write `apps/mobile/components/client/booking-sheet.tsx`. Structure:
```tsx
// BookingSheet
//   ├─ HeroStripe: class type color bar + class name (big) + time + room
//   ├─ Trainer row with avatar initials
//   ├─ MetricRow: Duration, Capacity, Spots left
//   ├─ What to bring section (hardcoded for now: "Grip socks, water bottle")
//   ├─ Cancellation policy row (pulled from server if applicable, else hidden)
//   └─ Sticky CTA footer:
//        - "Book · Uses 1 session"  primary button (or "Join waitlist" if full)
//        - "Cancel booking" danger if already booked
```

Visual: 90% sheet with HeroCard (tone="accent") at top showing class name + time, then GlassCard sections below. Use MetricRow for the detail rows. Motion: Moti stagger on the three content sections (delays 0/80/160ms, translateY 12→0).

Haptics: `Haptics.impactAsync(Heavy)` on primary CTA press (confirming booking), `Haptics.notificationAsync(Success)` on mutation success (already wired).

- [ ] **Step 3: Replace inline sheet content in calendar.tsx with `<BookingSheet ... />`**

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/components/client/booking-sheet.tsx apps/mobile/app/\(client\)/calendar.tsx
git commit -m "feat(client): redesign booking sheet with hero stripe and metric rows"
```

---

## Task 5: Redesign client Home (`app/(client)/index.tsx`)

**Files:**
- Modify: `apps/mobile/app/(client)/index.tsx`

**References:**
- `docs/inspiration/Apple Fitness ios Feb 2026/` — 3 images of summary/home with ring + activity
- `docs/inspiration/Strava ios Feb 2025/` — 3 images of home feed with hero activity card
- `docs/inspiration/WHOOP ios Apr 2024/` — 2 images showing "today's summary" metric grouping

- [ ] **Step 1: Pick images, comment them at top of file**

- [ ] **Step 2: New structure**

```
ScreenContainer (px-0 for hero bleed)
├─ Greeting row (Hello, <name> · <date> · notif bell)     — px-6
├─ HeroCard (accent tone)                                   — mx-6
│   ├─ SectionLabel "Next class"
│   ├─ BIG ScreenTitle "Reformer Flow"                       — 28px
│   ├─ MutedText "Tomorrow · 10:00 AM · Room 1 · Trainer"
│   └─ Button (variant="secondary", label="View details")
├─ WeekStrip (single row, activity dots)                    — px-6
├─ GlassCard: Package summary                               — mx-6
│   ├─ Row: ProgressRing (big, 72px) + text column
│   │    ├─ "8 of 12 sessions used"
│   │    └─ "Expires May 14, 2026"
│   └─ LinkText "View packages" → profile
├─ Onboarding checklist (existing component) if needed       — mx-6
├─ SectionLabel "Recent notes"                               — px-6
└─ Notes list: up to 3 GlassCards with note preview         — mx-6
```

All top-level sections wrapped in MotiView with stagger delays (0, 80, 160, 240, 320ms).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/\(client\)/index.tsx
git commit -m "feat(client): redesign home with hero next-class card and motion stagger"
```

---

## Task 6: Redesign admin dashboard (`app/(admin)/index.tsx`)

**Files:**
- Modify: `apps/mobile/app/(admin)/index.tsx`

**References:**
- `docs/inspiration/Stripe Dashboard ios Jun 2023/` — 4 images of dashboard numbers + chart
- `docs/inspiration/Linear Mobile ios Apr 2026/` — 2 images of list density + segmented tabs
- `docs/inspiration/WHOOP ios Apr 2024/` — 2 images of stat grouping

- [ ] **Step 1: Pick images, comment them at top of file**

- [ ] **Step 2: New structure**

```
ScreenContainer
├─ Row: "Dashboard" title + gear icon → settings
├─ HeroCard (default tone):
│   ├─ SectionLabel "Revenue this month"
│   ├─ NumberRollup 48px bold + currency                 — €4,231
│   └─ Delta chip "▲ 12% vs last month"
├─ 2×2 StatTile grid                                     — gap-3
│   ├─ Sessions today      | Active clients
│   └─ New clients (mo)    | Attendance rate
├─ SegmentedControl: Day / Week / Month
├─ Today's schedule section (top 5 SessionCards), "View all" → calendar
└─ FAB (floating, bottom-right): + create session
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/\(admin\)/index.tsx
git commit -m "feat(admin): redesign dashboard with revenue hero, stat grid, schedule preview"
```

---

## Task 7: Redesign admin billing (`app/(admin)/billing.tsx`)

**Files:**
- Modify: `apps/mobile/app/(admin)/billing.tsx`

**References:**
- `docs/inspiration/Stripe Dashboard ios Jun 2023/` — 5 images: period selector + summary number + transaction list + detail view

- [ ] **Step 1: Pick images, comment them at top of file**

- [ ] **Step 2: New structure**

```
├─ Period selector (month/year with chevrons, centered)
├─ HeroCard:
│   ├─ SectionLabel "Total revenue · April 2026"
│   ├─ NumberRollup "€4,231.00"                          — 48px bold
│   ├─ Row: Transactions · 31 | Avg per client · €137
│   └─ Mini sparkline (victory-native) — last 12 weeks
├─ SegmentedControl: All / Success / Refunded / Pending
├─ Transaction list — FlatList of GlassCards
│    ├─ Row: client avatar + name + package + amount
│    └─ Row: date · status badge
└─ Detail sheet on tap (existing logic, restyle with MetricRows)
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/\(admin\)/billing.tsx
git commit -m "feat(admin): redesign billing with stripe-style hero and sparkline"
```

---

## Task 8: Redesign admin reports (`app/(admin)/reports.tsx`)

**Files:**
- Modify: `apps/mobile/app/(admin)/reports.tsx`

**References:**
- `docs/inspiration/Stripe Dashboard ios Jun 2023/` — 3 images of bar charts + metric pairing
- `docs/inspiration/WHOOP ios Apr 2024/` — 3 images of ring/metric combos and "insights"
- `docs/inspiration/Apple Fitness ios Feb 2026/` — 2 images of summary ring + labels

- [ ] **Step 1: Pick images, comment them at top of file**

- [ ] **Step 2: New structure**

```
├─ Period selector (this week / this month / custom)
├─ 2×2 StatTile grid (sessions held, attendance rate, new clients, revenue)
├─ HeroCard: "Attendance this month" with victory-native bar chart inside
├─ SectionLabel "Popular classes"
│   └─ Ranked list: 1–5 rows, GlassCard each
│        ├─ Number rank (big muted) + class name
│        └─ horizontal bar proportional to bookings
└─ SectionLabel "Trainer utilization"
    └─ List of ListRow with fill rate progress bar per trainer
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/\(admin\)/reports.tsx
git commit -m "feat(admin): redesign reports with stat grid, hero chart, ranked lists"
```

---

## Task 9: Redesign admin clients (`app/(admin)/clients.tsx`)

**Files:**
- Modify: `apps/mobile/app/(admin)/clients.tsx`

**References:**
- `docs/inspiration/Linear Mobile ios Apr 2026/` — 4 images of searchable list with filter chips + detail slide-in
- `docs/inspiration/Fresha ios Oct 2024/` — 2 images of customer list and customer detail card

- [ ] **Step 1: Pick images, comment them at top of file**

- [ ] **Step 2: New structure**

```
├─ Header row: "Clients" title + search icon + "+" FAB in corner
├─ Search bar (glass input with search icon prefix), animates in/out on tap
├─ SegmentedControl: Clients (34) / Invites (3)
├─ Filter chips row: All · Active · Expiring · Expired  (horizontal scroll)
├─ FlatList of GlassCard rows:
│   ├─ Avatar (initials, accent bg)
│   ├─ Name + email column
│   ├─ Status badge (active package / expiring / none)
│   └─ Chevron
└─ Detail sheet on tap — redesigned with MetricRows, package assignment CTA
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/\(admin\)/clients.tsx
git commit -m "feat(admin): redesign clients with linear-style list and filter chips"
```

---

## Task 10: Redesign admin packages (`app/(admin)/packages.tsx`)

**Files:**
- Modify: `apps/mobile/app/(admin)/packages.tsx`

**References:**
- `docs/inspiration/ClassPass ios May 2022/` — 3 images of credit/package listing
- `docs/inspiration/Linear Mobile ios Apr 2026/` — 2 images of grouped list with counts

- [ ] **Step 1: Pick images, comment them at top of file**

- [ ] **Step 2: New structure**

```
├─ Header: "Packages" + "+"
├─ SectionLabel "Package types"
│   └─ List of GlassCards:
│        ├─ Name big + validity + price
│        └─ Session count badge
├─ SectionLabel "Active assignments"
├─ Filter chips: All · Expiring Soon · Expired
└─ FlatList of assignment rows (GlassCard): avatar + client + pkg + remaining + expiry
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/\(admin\)/packages.tsx
git commit -m "feat(admin): redesign packages with grouped sections and filter chips"
```

---

## Task 11: Redesign admin settings (`app/(admin)/settings/*`)

**Files:**
- Modify: `apps/mobile/app/(admin)/settings/index.tsx`
- Modify: `apps/mobile/app/(admin)/settings/class-types.tsx`
- Modify: `apps/mobile/app/(admin)/settings/rooms.tsx`
- Modify: `apps/mobile/app/(admin)/settings/general.tsx`

**References:**
- `docs/inspiration/Linear Mobile ios Apr 2026/` — 3 images of settings list with groups + chevrons
- `docs/inspiration/Apple Fitness ios Feb 2026/` — 1 image of preferences-style grouping

- [ ] **Step 1: Pick images, comment them at top of each file**

- [ ] **Step 2: New structure**

Settings index:
```
├─ Header: back arrow + "Settings"
├─ GlassCard section: Account (profile, sign out)
├─ GlassCard section: Studio (class types, rooms, general)
├─ GlassCard section: Preferences (language, notifications)
```

Each row inside a GlassCard: icon + label + value + chevron. Use MetricRow pattern with right-side chevron.

Sub-screens (class-types, rooms, general): each uses a "New item" FAB and list of GlassCard rows with edit/delete swipe actions.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/\(admin\)/settings
git commit -m "feat(admin): redesign settings with grouped glass sections"
```

---

## Task 12: Redesign trainer schedule (`app/(trainer)/index.tsx`)

**Files:**
- Modify: `apps/mobile/app/(trainer)/index.tsx`

**References:**
- `docs/inspiration/Fresha ios Oct 2024/` — 4 images of appointment list density, trainer-facing
- `docs/inspiration/Google Calendar ios May 2021/` — 2 images of day view (we'll reuse TimeAxisDayView)

- [ ] **Step 1: Pick images, comment them at top of file**

- [ ] **Step 2: New structure**

```
├─ Greeting row (Hello, <trainer name> · <date>)
├─ HeroCard: "Today's stats" — sessions · clients · hours tracked
├─ WeekStrip
├─ TimeAxisDayView (same as client, but session blocks show client count + trainer edit sheet on tap)
```

Session detail sheet for trainer: client list with initials + quick note button.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/\(trainer\)/index.tsx
git commit -m "feat(trainer): redesign schedule with hero stats and time-axis day view"
```

---

## Task 13: Redesign trainer clients (`app/(trainer)/clients.tsx`)

**Files:**
- Modify: `apps/mobile/app/(trainer)/clients.tsx`

**References:**
- `docs/inspiration/Fresha ios Oct 2024/` — 3 images of customer detail + grouped by appointment
- `docs/inspiration/Linear Mobile ios Apr 2026/` — 2 images of grouped list with sticky headers

- [ ] **Step 1: Pick images, comment them at top of file**

- [ ] **Step 2: New structure**

```
├─ ScreenTitle "My Clients"
├─ GlassCard hero: today stats (N sessions today · M clients today)
├─ Sticky date headers grouping clients by upcoming session
│   ├─ Date header (caps, muted)
│   ├─ Class subheader (time + class type)
│   └─ Client rows: avatar + name + expand-chevron → notes
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/\(trainer\)/clients.tsx
git commit -m "feat(trainer): redesign clients with sticky date grouping"
```

---

## Task 14: Redesign trainer notes (`app/(trainer)/notes.tsx`)

**Files:**
- Modify: `apps/mobile/app/(trainer)/notes.tsx`

**References:**
- `docs/inspiration/Linear Mobile ios Apr 2026/` — 4 images of issue/note list and compose sheet
- `docs/inspiration/Fresha ios Oct 2024/` — 2 images of customer note-taking

- [ ] **Step 1: Pick images, comment them at top of file**

- [ ] **Step 2: New structure**

```
├─ Header: "Session Notes" + search icon
├─ Filter chips: All · This week · By client
├─ FlatList (Legend List for perf): GlassCard rows
│   ├─ Client name + class + date
│   └─ 2-line note preview
├─ FAB bottom-right: +
└─ Compose sheet: session picker, client picker, multiline glass input, "Save"
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/\(trainer\)/notes.tsx
git commit -m "feat(trainer): redesign notes with filter chips and compose sheet"
```

---

## Task 15: Redesign client notifications (`app/(client)/notifications.tsx`)

**Files:**
- Modify: `apps/mobile/app/(client)/notifications.tsx`

**References:**
- `docs/inspiration/Linear Mobile ios Apr 2026/` — 3 images of notification/inbox list
- `docs/inspiration/Apple Fitness ios Feb 2026/` — 2 images of notifications grouped by day

- [ ] **Step 1: Pick images, comment them at top of file**

- [ ] **Step 2: New structure**

```
├─ Header: "Inbox" + gear icon → preferences sheet
├─ SegmentedControl: All · Unread
├─ Grouped list with sticky date headers (Today / Yesterday / Earlier)
│   └─ Notification rows (GlassCard):
│       ├─ Icon by type (booking / cancellation / reminder / promo)
│       ├─ Title + body 2-line preview
│       ├─ Unread: green left accent border + bold title
│       └─ Timestamp right-aligned
└─ Preferences sheet (existing, restyle rows with MetricRow pattern)
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/\(client\)/notifications.tsx
git commit -m "feat(client): redesign notifications with grouped inbox and icons"
```

---

## Task 16: Redesign client profile (`app/(client)/profile.tsx`)

**Files:**
- Modify: `apps/mobile/app/(client)/profile.tsx`

**References:**
- `docs/inspiration/ClassPass ios May 2022/` — 3 images of credits/profile/packages section
- `docs/inspiration/WHOOP ios Apr 2024/` — 2 images of profile stat grouping

- [ ] **Step 1: Pick images, comment them at top of file**

- [ ] **Step 2: New structure**

```
├─ Hero: large avatar (initials, 80px), name, email
├─ StatTile row: Total sessions · Current streak · Attendance %
├─ GlassCard section: My Packages (list of package cards w/ ProgressRing)
├─ GlassCard section: Training History (paginated list)
├─ GlassCard section: Preferences (language, notifications link)
└─ Sign out button (danger variant, full width)
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/\(client\)/profile.tsx
git commit -m "feat(client): redesign profile with hero avatar, stat tiles, sections"
```

---

## Task 17: Redesign auth — sign in (`app/sign-in.tsx`)

**Files:**
- Modify: `apps/mobile/app/sign-in.tsx`

**References:**
- `docs/inspiration/Strava ios Feb 2025/` — 3 images of sign-in / welcome with hero imagery
- `docs/inspiration/Apple Fitness ios Feb 2026/` — 2 images of onboarding welcome with bold type
- `docs/inspiration/Peloton ios Nov 2023/` — 1 image for reference (note: Peloton is otherwise dropped, but their welcome imagery works for auth)

- [ ] **Step 1: Pick images, comment them at top of file**

- [ ] **Step 2: New structure**

Shift from "form on gradient" to "immersive welcome":

```
AuthBackground (with new: faint pilates reformer silhouette graphic in background — placeholder: we'll add actual imagery later. For now, use a subtle radial gradient centered top-30%)
├─ Top 35%: logo + wordmark, centered, larger than current
├─ Welcome heading with big typography: "Welcome back" 36px bold, then
│   subtitle in muted text
├─ Glass panel (not full-width — inset 24px both sides, rounded-3xl, padded 24px):
│   ├─ Email input
│   ├─ Password input
│   ├─ Forgot password link (right-aligned)
│   ├─ Error state (Moti slide-in)
│   └─ Sign in button (large, full-width inside panel)
├─ Divider or spacer
└─ Bottom: version number (xs muted) + legal link
```

Motion: logo fades + slides down 12px on mount (400ms), heading stagger 150ms, glass panel stagger 300ms with MotiView `translateY: 24 → 0`. Error states slide in from top. Button press: haptic Light, slight scale.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/sign-in.tsx
git commit -m "feat(auth): redesign sign-in with immersive welcome and glass panel"
```

---

## Task 18: Redesign auth — reset password (`app/reset-password.tsx`)

**Files:**
- Modify: `apps/mobile/app/reset-password.tsx`

**References:**
- Apply the same design language as sign-in (Strava + Apple Fitness).
- `docs/inspiration/Linear Mobile ios Apr 2026/` — 2 images for the "check your email" confirmation-style screen

- [ ] **Step 1: Pick images, comment them at top of file**

- [ ] **Step 2: New structure**

```
AuthBackground
├─ Top bar: back chevron (absolute top-left)
├─ Icon badge centered: lock icon in 64px accent-tinted circle
├─ Two-step (step 1: request, step 2: confirm), dots or progress indicator at top of glass panel
├─ Glass panel:
│   ├─ Step 1: Heading "Reset your password" + email input + "Send reset link" CTA
│   ├─ Step 2: Heading "Check your email" + subtitle with user's email + token input + new password input + "Reset password" CTA
│   └─ Success state: green checkmark in circle badge + "Password updated" + "Back to sign in" link
└─ Moti crossfade (400ms) between steps
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/reset-password.tsx
git commit -m "feat(auth): redesign reset-password with icon badge and step crossfade"
```

---

## Task 19: Redesign / create auth — accept invite (`app/accept-invite.tsx`)

**Files:**
- Create or modify: `apps/mobile/app/accept-invite.tsx`

**References:**
- `docs/inspiration/Peloton ios Nov 2023/` — 3 images of onboarding welcome (celebratory tone)
- `docs/inspiration/Strava ios Feb 2025/` — 2 images of signup/welcome

- [ ] **Step 1: Pick images, comment them at top of file**

- [ ] **Step 2: Verify if `accept-invite.tsx` exists**

Run: `ls apps/mobile/app/accept-invite.tsx 2>&1 || echo "missing"`

- [ ] **Step 3: Create or rewrite with celebratory hero tone**

Structure:
```
AuthBackground
├─ Celebratory heading: "Welcome to [Studio Name]" + subtitle
├─ Inviter row: avatar (initials) + "[Admin Name] invited you"
├─ Glass panel:
│   ├─ Pre-filled email (read-only, dim)
│   ├─ Name input
│   ├─ Create password + confirm password
│   ├─ Terms/privacy link (xs muted)
│   └─ "Join [Studio Name]" large accent CTA
```

Motion: confetti-style Moti opacity fade + scale on the heading (200ms), stagger rest.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/accept-invite.tsx
git commit -m "feat(auth): redesign accept-invite with celebratory hero"
```

---

## Task 20: Global polish pass

- [ ] **Step 1: Audit tab bars across roles**

Open `(client)/_layout.tsx`, `(trainer)/_layout.tsx`, `(admin)/_layout.tsx`. Ensure tab bar:
- Uses `BlurView` as `tabBarBackground` on iOS
- `backgroundColor: "rgba(10,15,20,0.85)"` on Android/web
- Icon active color `#2e5b42`, inactive `rgba(255,255,255,0.5)`
- Safe-area bottom padding respected

Fix any tab bar that still uses old styling.

- [ ] **Step 2: Verify pull-to-refresh tint**

Search for `RefreshControl` usages:
```bash
grep -rn "RefreshControl" apps/mobile/app --include="*.tsx"
```

Ensure each uses `tintColor="#2e5b42"` (iOS) and `colors={["#2e5b42"]}` (Android).

- [ ] **Step 3: Verify skeletons on all list screens**

For each screen that uses `useQuery`, confirm there's a `isPending` branch that renders 3 `Skeleton` cards matching the list row dimensions.

- [ ] **Step 4: Final smoke test**

Run the app, click through every screen on iOS simulator. Look for:
- Visual regressions (wrong color, missing blur, bad spacing)
- Animation jank (dropped frames, stuttering sheets)
- Haptics firing on button press, WeekStrip day change, booking confirm
- All text readable (contrast)

Capture any issues as step-6 fixes.

- [ ] **Step 5: Type check + lint**

Run from `apps/mobile/`:
```bash
npx tsc --noEmit
```

Run from repo root:
```bash
pnpm lint
```

Expected: both clean.

- [ ] **Step 6: Fix anything the smoke test revealed**

Commit fixes as needed:
```bash
git add -A
git commit -m "fix: polish pass after redesign"
```

---

## Self-Review Checklist

- [x] New primitives: HeroCard, StatTile, MetricRow, NumberRollup, SegmentedControl, TimeAxisDayView (Tasks 1–2)
- [x] Client: calendar, booking sheet, home, notifications, profile (Tasks 3–5, 15–16)
- [x] Admin: dashboard, billing, reports, clients, packages, settings (Tasks 6–11)
- [x] Trainer: schedule, clients, notes (Tasks 12–14)
- [x] Auth: sign-in, reset-password, accept-invite (Tasks 17–19)
- [x] Each screen references specific Mobbin image paths in a file-level comment (Tasks 3–19 Step 1)
- [x] Motion: Moti stagger on mounts, haptics on key interactions
- [x] Card tiers introduced: HeroCard, GlassCard (existing), StatTile
- [x] TimeAxisDayView replaces session list (Tasks 3, 12)
- [x] Tab bars, skeletons, pull-to-refresh consistent across roles (Task 20)
- [x] Type check + lint clean (Task 20)
- [x] Peloton dropped as a reference except for auth onboarding welcome (Tasks 17, 19)

**Dependencies:** This plan requires `2026-04-23-uniwind-migration.md` to be fully executed first.
