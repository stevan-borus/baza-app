# Baza App — Full UI Redesign

**Date:** 2026-03-10
**Status:** Approved

## Overview

Complete UI redesign of the Baza Pilates studio management app across all three roles (Client, Trainer, Admin) and auth screens. The redesign draws inspiration from:

- **Calm + Peloton** — Auth screens (dark wellness gradient, frosted inputs, bold CTAs)
- **Apple Fitness** — Dashboard cards, weekly strip calendar, progress rings, stat tiles
- **Fresha** — Booking flow, appointment management, confirmation patterns
- **ClassPass** — Home feed layout, credits/package display, schedule list views
- **Peloton** — Onboarding checklist, class interest grid, filter patterns
- **Linear** — Clean list views, notification settings, segmented controls

**Design direction:** Dark-first theme across all roles. Frosted glass card aesthetic. Green (#2e5b42) accent throughout. Cross-platform: iOS, Android, and Web (Expo Web).

## 1. Design System Foundation

### Tamagui Strategy

The app already has 12 Tamagui packages installed (including the babel and metro compiler plugins) but uses them minimally — just `YStack`/`XStack`/`Text` as dumb wrappers. This redesign leans into Tamagui properly to get full value from the existing dependency cost.

**Enable the compiler:**
- Wire `@tamagui/babel-plugin` into `babel.config.js` — extracts static styles at build time
- Wire `@tamagui/metro-plugin` into `metro.config.js` — optimizes bundles
- This is a free performance boost: `YStack bg="$background" p="$4"` becomes a pre-computed StyleSheet at build time instead of runtime style resolution

**Use `styled()` for all new components:**
All new components (GlassCard, Button, Input, SessionCard, StatCard, etc.) are built using Tamagui's `styled()` function with variant props. This gives:
- Theme-aware tokens (`$background`, `$color`, `$accent1`) that auto-switch in dark/light
- Compiler optimization (static extraction)
- Less code than manual `StyleSheet.create` + conditional logic
- Type-safe variant props

Example pattern:
```tsx
const GlassCard = styled(YStack, {
  backgroundColor: 'rgba(255,255,255,0.06)',
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.08)',
  borderRadius: 16,
  padding: '$4',
  variants: {
    accentBorder: {
      left: { borderLeftWidth: 3, borderLeftColor: '$accent1' },
      top: { borderTopWidth: 3, borderTopColor: '$accent1' },
    },
  },
})
```

**Use Tamagui animations:**
The config already defines `bouncy`, `lazy`, `quick` animation presets via `@tamagui/animations-react-native`. Use these for:
- Sheet entry/exit (bouncy)
- Floating label transitions (quick)
- Press effects and card interactions (quick)
- Skeleton pulsing (lazy)
Instead of hand-rolling `react-native-reanimated` animations where Tamagui's `animation` prop suffices.

**Use Tamagui's built-in Sheet:**
The `tamagui` package includes a Sheet component with handle indicators, snap points, and spring animations. Use this instead of the current custom sheet implementation. Restyle it with the glass aesthetic.

**Use Tamagui media queries for web responsiveness:**
Define responsive breakpoints in `tamagui.config.ts`:
```tsx
media: {
  sm: { maxWidth: 640 },   // mobile
  md: { maxWidth: 1024 },  // tablet
  lg: { minWidth: 1025 },  // desktop web
}
```
Components use `$md` and `$lg` media props to adapt layout on web. See "Web Responsiveness" section below.

### Web Responsiveness

The app runs on Expo Web in addition to iOS/Android. On web, screens should adapt to larger viewports:

**Mobile-first approach:** All layouts are designed for phone screens first. Tamagui media queries add web adaptations.

**Web-specific adaptations:**
- **Max content width:** On screens wider than 640px, content is constrained to a centered 480px column (phone-width container). This prevents stretched-out layouts on desktop browsers while maintaining the mobile design language.
- **Tablet (641-1024px):** Same phone layout but with more breathing room. Cards may sit in a 560px centered container.
- **Desktop (1025px+):** For admin screens with dense data (clients list, billing, reports), consider a 2-column layout: sidebar navigation on the left, content on the right. Client/trainer screens stay single-column centered.
- **Hover states:** On web, add subtle hover effects to interactive cards and buttons (slight brightness increase). Use Tamagui's `hoverStyle` prop.
- **Cursor:** Interactive elements get `cursor: pointer` on web via Tamagui's `cursor` prop.

**Implementation notes:**
- `expo-blur` works on web via CSS `backdrop-filter` natively — no fallback needed (unlike Android)
- Touch interactions (pressStyle) translate to click on web automatically via React Native Web
- Tab bar remains at bottom on mobile web; on desktop widths, could optionally move to a sidebar (stretch goal, not Phase 1)

### Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| Background | #0A0F14 | Primary app background |
| Surface | rgba(255,255,255,0.06) + blur | Cards, sheets, inputs |
| Surface border | rgba(255,255,255,0.08) | 1px card/input borders |
| Accent | #2e5b42 | CTAs, active states, progress |
| Accent light | #4a8c6b | Pressed states, secondary highlights |
| Danger | #c44b4b | Cancel, delete, errors |
| Warning | #c4944b | Expiring, waitlist |
| Text primary | rgba(255,255,255,0.9) | Headings, body text |
| Text secondary | rgba(255,255,255,0.5) | Subtitles, captions |
| Text tertiary | rgba(255,255,255,0.3) | Hints, disabled |

### Component Upgrades

All components built with Tamagui `styled()` for theme-awareness, compiler optimization, and variant support.

- **GlassCard** — `styled(YStack)`. Replaces current Card. Backdrop blur + translucent bg + thin border. Variants: `accentBorder` (left/top with color), `translucent` (opacity level). Android fallback via Platform check: solid dark surface without blur. Web: CSS `backdrop-filter` works natively. Includes `hoverStyle` for web hover effect.
- **Button** — `styled(Tamagui.Button)`. Variants: `variant` (primary/secondary/danger/ghost), `size` (sm/md/lg). Primary: solid green. Secondary: glass/translucent. 12px radius. `pressStyle={{ scale: 0.97 }}`. `hoverStyle` for web. `cursor="pointer"` on web.
- **Input** — `styled()` wrapper. Glass-style bg, thin border, floating labels using Tamagui `animation="quick"` for focus transition, icon prefix support.
- **Tab bar** — Frosted glass floating bar, refined with blur and updated icons. Same component across all roles.
- **Sheets** — Use Tamagui's built-in `Sheet` component, restyled with glass background and handle indicator. Spring animation via `animation="bouncy"`.
- **Badges** — `styled(Text)`. Variants by status type. Translucent fills with colored text.
- **Empty states** — Composed component: centered icon, heading, subtitle, optional CTA button.
- **StatCard** — `styled(GlassCard)`. Small card with large number and label below.
- **ProgressRing** — `react-native-svg` based circular ring. Not a styled() component (SVG doesn't benefit from Tamagui compiler).
- **WeekStrip** — Horizontal scrollable day pills, selected day in green circle, dot indicators for activity. Shared across all roles. Uses `ScrollView` + `styled()` day pill components.
- **SessionCard** — `styled(GlassCard)` with session-specific layout. Time, class name, trainer, room, capacity badge. Shared component, different detail sheets per role. Variants: `classType` for colored left border (Yoga=teal, Pilates=green, HIIT=coral).

### Typography

- Screen titles: 28px bold, -0.5 letter spacing
- Section headers: 20px semibold, -0.3 letter spacing
- Body: 16px regular
- Caption: 13px, 50% opacity
- Font: Inter (keep current)

### Interactions

All animations use Tamagui's built-in animation presets (already configured in `tamagui.config.ts`):

- Input floating labels: `animation="quick"` for translate Y + scale on focus
- CTA buttons: `pressStyle={{ scale: 0.97 }}` — handled by Tamagui's press system
- Cards: `pressStyle={{ opacity: 0.8 }}` — Tamagui press system
- Sheets: `animation="bouncy"` via Tamagui Sheet component
- Skeleton pulsing: `animation="lazy"` for opacity oscillation
- Web: `hoverStyle={{ brightness: 1.05 }}` on interactive elements — Tamagui handles web-only hover automatically
- Keep subtle — polish, not heavy animation

### Loading & Skeleton States

- All data-driven screens show skeleton placeholders while loading (pulsing glass-shaped rectangles matching card dimensions)
- Skeleton colors: rgba(255,255,255,0.03) pulsing to rgba(255,255,255,0.06)
- Lists show 3 skeleton cards by default
- Individual stat values show a small pulsing bar in place of the number

### Error States

- API errors on any screen: glass card with red-tinted left border, error icon, message text, "Retry" button
- Network errors: full-screen centered error state with wifi-off icon, "No connection" heading, "Try again" CTA
- Booking failures: toast-style notification that slides down from top, auto-dismisses after 4s

### Pull-to-Refresh

- All scrollable list screens support pull-to-refresh (notifications, session lists, client lists, notes, transactions)
- Refresh indicator uses green accent color
- Triggers TanStack Query `refetch` on the relevant query

### Accessibility

- Text primary (90% white on #0A0F14) = contrast ratio ~14:1 (passes WCAG AAA)
- Text secondary (50% white on #0A0F14) = ~7.5:1 (passes WCAG AA)
- Text tertiary (30% white on #0A0F14) = ~4.2:1 — used ONLY for decorative/hint text, never for actionable content. Interactive elements must use secondary or primary.
- All icon-only buttons have accessible labels
- ProgressRing announces percentage to screen readers
- Haptic feedback on booking confirmation and destructive actions (light impact)

### Platform-Specific Considerations

**Android:**
- `backdrop-filter` blur fallback: solid dark surfaces (rgba(20,25,30,0.95)) without blur, same border treatment
- Test on mid-tier Android devices specifically for jank
- `expo-blur` may cause frame drops on low-end devices — fallback is the safe default
- Detect via `Platform.OS === 'android'` in GlassCard component

**Web:**
- CSS `backdrop-filter: blur()` works natively in all modern browsers — no fallback needed
- `hoverStyle` and `cursor: pointer` are web-only enhancements via Tamagui
- Touch events translate to click automatically via React Native Web
- Test in Chrome, Safari, Firefox at mobile, tablet, and desktop widths

**iOS:**
- `expo-blur` works well — use `BlurView` with `intensity` prop
- Haptic feedback via `expo-haptics` for booking confirmations and destructive actions

### New Dependencies

- `react-native-svg` — Required for ProgressRing component (circular progress indicator)
- `victory-native` — Required for Admin Reports bar charts (lightweight, RN-native charting)
- `expo-haptics` — Required for haptic feedback on booking confirmations and destructive actions (iOS/Android only, no-op on web)
- All added in Phase 1

### Color Token Migration

The existing codebase uses different color values that will be replaced:
- Current dark bg `hsla(151, 30%, 5%, 1)` (~#091A10) → new `#0A0F14` (less green-tinted, more neutral dark)
- Current dark tint `#4ade80` (bright green) → removed. Replaced by accent `#2e5b42` and accent light `#4a8c6b`
- Current light tint `#2e5b42` → kept as primary accent, used in both themes
- All color tokens consolidated into the Tamagui theme config

## 2. Auth Screens

### Sign In

- Full-screen dark gradient background (subtle radial gradient, dark green-tinted center to near-black edges)
- Centered Baza logo/wordmark with generous top spacing (~30% from top)
- "Welcome back" heading, "Sign in to your account" subtitle
- Two glass-style inputs: email (mail icon prefix, floating label), password (lock icon prefix, floating label, eye toggle)
- "Forgot password?" link aligned right, accent green
- "Sign In" full-width green CTA — disabled/dim until both fields have content
- Error state: red-tinted glass card slides in above button
- No social login buttons

### Reset Password

- Same dark gradient background, back arrow top-left
- Lock icon in circular glass badge centered
- Two-step flow with dot indicator:
  - **Step 1 (Request):** "Reset your password" heading, email input, "Send reset link" CTA
  - **Step 2 (Reset):** "Check your email" heading, description with email address, token input, new password input, "Reset password" CTA
- Success: green checkmark in circular badge, "Password updated" text, "Back to sign in" link

### Invite Acceptance

**New route: `app/accept-invite.tsx`** — Does not exist in current codebase, must be created. Accessed via deep link: `baza://accept-invite?token=xxx` or web URL redirect from email invite link. The API endpoint already exists at `api/auth/complete-invite/+api.ts`.

- Same dark gradient background
- "Welcome to [Studio Name]" heading
- "You've been invited by [Admin Name]" subtitle
- Pre-filled email (read-only, dimmed) — extracted from invite token
- Name field (if not set)
- Create password + confirm password fields
- "Join [Studio Name]" green CTA
- Terms/privacy link in tertiary text

## 3. Client Screens

### Tab Structure: Home, Calendar, Notifications, Profile (4 tabs — Profile is new)

**New route: `app/(client)/profile.tsx`** — Must be created. The current `(client)/_layout.tsx` has 3 tabs; update to 4 tabs with Profile added as the rightmost tab (person icon).

### Home Tab

1. **Greeting:** "Hello, [First Name]" with date, notification bell with unread badge (top-right)
2. **Next class card:** Glass card with green left accent border. Class name, trainer, relative time ("Tomorrow at 10:00 AM"), room. Tap for detail. Empty state: "No upcoming classes" + "Browse schedule" CTA
3. **Weekly activity strip:** M T W T F S S — filled green dots for booked, hollow for available, empty for nothing
4. **Package summary card:** Glass card with circular progress ring (sessions used/total), "X sessions remaining" large text, "Expires [date]" subtitle. Multiple packages: horizontally scrollable
5. **Onboarding checklist** (new clients only, see Section 7)
6. **Recent trainer notes:** Last 2-3 notes as compact glass cards, "See all" link

### Calendar Tab

- Month/year heading with arrows
- Horizontal week strip: scrollable day pills, selected in green circle, dots for days with sessions
- Day view: time-ordered session glass cards — time (bold left), class name, trainer, capacity badge ("3/8 spots" green or "Full" amber)
- **Booking sheet:** Class info rows with icons, capacity status, session cost indicator
  - **Booking flow:** Tap "Book session" → sheet shows confirmation state: "Confirm booking? This will use 1 of your 12 remaining sessions" with "Confirm" green CTA and "Cancel" text link. Two-step to prevent accidental bookings.
  - **Post-booking:** Sheet dismisses, session card updates to show "Booked" badge in green, subtle haptic feedback
  - **Cancellation:** Tap booked session → sheet shows "Cancel booking" red CTA. If within cancellation policy window, shows warning: "Cancellation deadline: [time]. Session will be returned to your package." If past deadline: "Late cancellation — session will not be returned." Respects existing `cancellation-policy.ts` server logic.
  - **Waitlist:** When session is full, "Join waitlist" amber CTA appears. User taps → added to waitlist. Card shows "Waitlisted (position #3)" badge. When spot opens, user gets a push notification. "Leave waitlist" option available in session detail.

### Notifications Tab

- List of glass notification cards
- Unread: green left border accent
- Type badge, timestamp
- Settings gear icon top-right → notification preferences sheet

### Profile Tab (new)

- Avatar circle (initials-only, not editable — no photo upload), name, email at top
- Grouped glass card sections:
  - **My Packages:** Full list of all assigned packages (active, paused, expired) with status badge, sessions remaining/total, expiry date. This differs from Home's package card which only shows the primary active package as a summary. Data source: existing `/api/client/packages` endpoint.
  - **Training History:** Paginated list of past attended sessions with date, class name, trainer. Data source: existing bookings endpoint filtered to past dates with status=attended.
  - **Preferences:** Language switcher, link to notification settings sheet (reuses same sheet from Notifications tab)
  - **Account:** Sign out button (danger styled)

## 4. Trainer Screens

### Tab Structure: Schedule, Clients, Notes (3 tabs — unchanged)

### Schedule Tab

- "Hello, [Name]" greeting with date
- Segmented control: Day / Week / Month (glass-style)
- Today's stats card: "X sessions today", "Y total clients today"

**Day view (default):**
- Week strip + day session list (as described in shared patterns)
- Session cards: time, class name, room, capacity badge, colored left border per class type (Yoga=teal, Pilates=green, HIIT=coral)
- Session detail sheet: class info + booked clients list with inline notes. No edit capability

**Week view:**
- 7-column grid showing abbreviated day headers (Mon-Sun). Each column shows stacked session blocks sized proportionally to duration. Tapping a session opens the same detail sheet. Compact: shows class name + time only per block.

**Month view:**
- Uses existing `react-native-big-calendar` in month mode (already a dependency). Restyled with glass theme — dark cells, green dots for days with sessions, green highlight for today. Tapping a day switches to Day view for that date. This reuses the existing calendar component rather than rebuilding it.

**Note on `react-native-big-calendar`:** Retained for Month view only (all roles). Day view and Week view are custom-built with the new design system. The library is not removed from dependencies.

### Clients Tab

- "My Clients" heading with count
- Grouped by upcoming session date:
  - Date header
  - Session subheader with class + time + capacity
  - Client rows: avatar (initials), name, email, chevron to expand for trainer notes
- Empty state with icon

### Notes Tab

- "Session Notes" heading
- Infinite scroll glass cards: client name, session name, note preview (2 lines), date
- Tap to expand
- FAB: green "+" bottom-right
- Create note sheet: session picker, client picker, multiline input, "Save note" CTA

## 5. Admin Screens

### Tab Structure: Schedule, Clients, Packages, Billing, Reports (5 tabs) + Settings via gear icon

**Structural change from current codebase:** The current `(admin)/_layout.tsx` has Settings as a 6th tab. This redesign removes Settings from the tab bar and makes it a stack screen accessible via a gear icon in the Schedule/Dashboard header. Implementation: the gear icon navigates to `(admin)/settings` using Expo Router's `router.push()` (stack navigation on top of tabs). The existing nested settings screens (class-types, rooms, general) remain as stack children under settings. This reduces tab bar to 5 items which is the iOS standard maximum.

**Admin does not get a notification bell** — notifications are a client-facing feature. Admin uses the dashboard stats for awareness.

### Schedule Tab (Admin Home)

- "Dashboard" heading, gear icon → Settings (top-right)
- Quick stats row: 3 small glass stat cards — today's sessions, active clients, month revenue
- Segmented control: Day / Week / Month (same Day/Week/Month views as Trainer schedule — shared components, but admin session cards show trainer name and have edit capability)
- Session cards: time, class, trainer, room, capacity
- Tap → session edit sheet (change time, trainer, room, capacity, cancel)
- FAB: "+" → create session sheet (datetime, class type, trainer, room, capacity, recurring toggle)

### Clients Tab

- Segmented control: "Clients (34)" / "Invites (3)"
- Client list: glass cards with avatar, name, email, phone, active package badge (green/amber/red)
- Tap → client detail sheet: info, packages, assign/pause package, trainer notes, edit
- Invites list: email, status badge, date, resend/revoke actions
- FAB: "+" → "New Client" or "Send Invite"

### Packages Tab

- Package types list: glass cards with name, session count, validity, price
- Tap to edit, FAB to create
- "Active Assignments" section below: clients with packages, remaining sessions, expiry
- Filter chips: All / Expiring Soon / Expired

### Billing Tab

- Period selector (month/year with arrows)
- Summary card: total revenue, transactions, average per client
- Transaction list: glass cards with client, package, amount, date, status badge
- Tap for detail

### Reports Tab

- Period selector: This week / This month / Custom
- Stat cards grid (2x2): sessions held, attendance rate, new clients, revenue
- Attendance chart: styled bar chart (sessions vs attendance)
- Popular classes: ranked list by bookings
- Trainer utilization: session count + fill rate per trainer

### Settings (sub-screen)

- Grouped glass card sections:
  - Class Types: colored dot, name, duration, capacity. Edit/add
  - Rooms: name, capacity. Edit/add
  - General: studio name, timezone, notification defaults
  - Account: admin profile, sign out

## 6. Onboarding Checklist (Client)

### Data Model

Local storage (AsyncStorage), keyed by user ID:
```json
{
  "profileCompleted": false,
  "notificationsConfigured": false,
  "firstClassBooked": false
}
```

No backend changes. Auto-detects completion from existing data:
- `profileCompleted` → true when user has name set (session data)
- `notificationsConfigured` → true when user visits notification settings and saves
- `firstClassBooked` → true when user has at least one booking (API data)

### UI Behavior

- Shows on client Home tab as card below "Next class", above package summary
- Glass card: "Get Started" heading, horizontal progress bar (green)
- 3 rows: icon, label, chevron. Completed = green checkmark + dimmed text
- Tap incomplete item → navigates to relevant screen
- All complete → "You're all set!" + dismiss button
- After dismiss → never shows again (AsyncStorage flag)
- Existing users never see it

## Implementation Phases

This redesign decomposes into 5 independent phases:

1. **Design System & Components** — Tamagui compiler setup (babel + metro plugins), media query breakpoints, color token migration, new dependencies (react-native-svg, victory-native), all new styled() components: GlassCard, Button, Input, WeekStrip, SessionCard, ProgressRing, StatCard, EmptyState, Badge, skeleton/loading states, error states, Tamagui Sheet restyle, typography updates, web hover/cursor styles
2. **Auth Screens** — Sign in, reset password, invite acceptance (new route)
3. **Client Screens** — Add Profile tab (new route), Home (with onboarding checklist), Calendar (week strip + day view + booking flow), Notifications restyle, Profile (packages, history, preferences)
4. **Trainer Screens** — Schedule (day/week/month views), Clients, Notes
5. **Admin Screens** — Remove Settings from tabs (gear icon → stack screen), Dashboard/Schedule, Clients, Packages, Billing, Reports, Settings sub-screen

Each phase can be executed in a separate session. Phase 1 must complete first. Phases 2-5 can run in any order after Phase 1, though Phase 3 (Client) is recommended next as highest-impact.

### Session Prompts

Each session should start with the following prompt (replace N with the phase number):

> Read the design spec at `docs/superpowers/specs/2026-03-10-ui-redesign-design.md`. Execute Phase N: [Phase Name]. Previous phases are complete — use the components and patterns already built. Create an implementation plan and execute it.
