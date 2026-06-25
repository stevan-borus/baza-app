# SDK 56 UI fixes & polish — design

**Date:** 2026-06-25
**Branch context:** `dev` (post Expo SDK 54→56 migration, commit `05faf72`)

Four reported UI issues plus a requested SDK-56 regression sweep. Split into
**two PRs** by concern:

- **PR A — SDK-56 regressions:** sheet close animation + ClientBanner X button.
- **PR B — UX improvements:** skeleton overhaul + Naplata client picker.

The regression sweep (a third user ask) turned up no additional code-level
regressions; its one finding (native date/time pickers) is a manual-verify
note, recorded at the end.

---

## PR A — SDK-56 regressions

### A1. Sheet close animation snaps shut on pan-release

**Symptom:** Dragging a sheet down is smooth, but on release it disappears
instantly instead of animating off-screen. New since SDK 56.

**Root cause:** `apps/mobile/components/ui/sheet.tsx` renders `BottomSheetModal`
with **no `animationConfigs` prop**, relying on gorhom's built-in default. Under
`@gorhom/bottom-sheet@^5.2.14` + `react-native-reanimated@~4.3.1` (the SDK-56
versions) the default dismiss animation resolves near-instantly on pan-release.

**Fix:** Pass an explicit `animationConfigs` built with gorhom's
`useBottomSheetTimingConfigs`, giving present *and* dismiss (including
pan-release) a smooth, duration-controlled animation.

```tsx
import { useBottomSheetTimingConfigs } from "@gorhom/bottom-sheet";
import { Easing } from "react-native-reanimated";

const animationConfigs = useBottomSheetTimingConfigs({
  duration: 320,
  easing: Easing.out(Easing.cubic),
});
// ...
<BottomSheetModal animationConfigs={animationConfigs} ... />
```

- Duration ~300–340ms with an ease-out curve reads as "settles off-screen"
  rather than "snaps."
- `useBottomSheetTimingConfigs` must be called inside the component (it's a
  hook) — add it alongside the existing `useThemeTokens()` call in `AppSheet`.
- The existing dismiss-retry machinery (`requestDismiss`, the 100ms tick loop)
  stays untouched — it solves a *different* problem (dropped dismiss calls), not
  animation smoothness. `animationConfigs` is purely additive.

**Verification:** Open any sheet (Naplata new payment, booking sheet, confirm
sheet), drag it partway down, release — it should glide off-screen. Also tap the
backdrop and the close affordance to confirm those paths animate too.

### A2. ClientBanner X button does nothing

**Symptom:** On the reservation screen, the "Rezerviše za <client>" banner has
an X; tapping it appears to do nothing.

**Root cause:** `apps/mobile/components/admin/reservation-mode.tsx:471–505`
nests the X `Pressable` (line 499) *inside* the banner's outer `Pressable`
(line 471). On RN the inner press still bubbles to the outer `onPress`, which
re-opens the client picker — so `onClear` fires and is immediately followed by
the picker re-opening. Net visible effect: nothing changed. (This is the same
nested-Pressable class as is already guarded elsewhere in the codebase via
`e.stopPropagation()` — e.g. `notes-feed.tsx`, `trainer-note-compose-sheet.tsx`.)

**Fix:** Stop the inner X press from reaching the outer pressable. Either:

- call `e.stopPropagation()` in the X `onPress` (matches the existing pattern in
  the codebase — preferred for consistency), **or**
- restructure so the X is a sibling of the tappable row rather than a child.

Go with `stopPropagation` for consistency with the rest of the codebase. The
`onClear` handler itself (clears `clientProfileId` / `clientUserId` /
`clientFullName` and resets `selection`) is already correct — only the event
bubbling needs fixing.

**Verification:** Select a client so the banner shows a name + X; tap X; the
banner should revert to "Izaberi klijenta" and the picker should NOT open.
Tapping the banner body (not the X) should still open the picker.

---

## PR B — UX improvements

### B1. Skeleton overhaul (Izveštaji + audit & fix all)

**Symptom:** Loading skeletons don't match the content they stand in for. Worst
on Izveštaji → Prihod: the bar-chart section (`PRIHOD KROZ VREME`) and the
labeled-rows-with-progress-bar sections (`PO PAKETU`, `PO NAČINU PLAĆANJA`) all
render a generic `SkeletonCard` (icon + two text lines).

**Current state** (`apps/mobile/components/ui/skeleton.tsx`): `Skeleton`,
`SkeletonText`, `SkeletonCard`, `SkeletonStatCard`, `SkeletonList`. Already-good
screens (admin dashboard `pregled`, catalog lists) keep their current skeletons
— do not touch those.

**Fix — add two content-shaped primitives to `skeleton.tsx`:**

1. **`SkeletonChart`** — mirrors the bar chart: a row of faint bars at varied
   heights sitting on a baseline, with a couple of short axis-label blocks
   below. Used for `PRIHOD KROZ VREME`.
2. **`SkeletonBreakdownRows({ count })`** — mirrors a breakdown row: a label
   block + an amount block on the right, with a thin progress-bar block beneath,
   repeated `count` times. Used for `PO PAKETU`, `PO NAČINU PLAĆANJA`, and the
   analogous lists on the other report screens.

Both reuse the existing `usePulse()` + theme tokens so the shimmer matches.

**Apply across the four Izveštaji detail screens:**
- `izvestaji/prihod/index.tsx` — chart section → `SkeletonChart`; the two
  breakdown sections → `SkeletonBreakdownRows`.
- `izvestaji/iskoriscenost/index.tsx`, `izvestaji/rezervacije/index.tsx`,
  `izvestaji/paketi/index.tsx` — replace generic `SkeletonCard` with the
  primitive matching each screen's real content (chart vs. breakdown rows vs.
  list), screen by screen.

**Audit pass:** walk every remaining screen that renders a skeleton and fix any
clear structural mismatch using the existing or new primitives. Leave screens
whose skeleton already mirrors content (dashboard, catalog lists, calendar)
alone. Record in the PR description which screens were changed and which were
deliberately left.

**Verification:** Throttle/cold-load each report screen and confirm the skeleton
silhouette matches the loaded layout (no jarring shape change on data arrival).

### B2. Naplata "Nova uplata" — dropdown → searchable picker sheet

**Symptom:** The "Klijent" field in the Nova uplata sheet is an inline `<Select>`
listing every client. Poor UX at scale.

**Current state** (`apps/mobile/app/(admin)/naplata/index.tsx`):
- Lines 110–119 eagerly drain *all* client pages (`take: 100`, `useEffect`
  loop) into `allClients`.
- Lines 401–412 feed `allClients` into a `<Select>`.

**Existing good pattern to mirror:** `components/admin/assign-package-flow.tsx`
— a single `AppSheet` with an internal step machine: **pickClient**
(searchable, paginated `BottomSheetFlatList` over `clientsQueries.list({ q })`)
→ form. Also reusable: `components/ui/client-picker.tsx`
(`<ClientPicker mode="free" bottomSheet>`).

**Fix:** Replace the inline `<Select>` in the Nova uplata form with a trigger
row ("Klijent" → selected name or placeholder + chevron) that opens a **stacked
client-picker sheet** on top of the Nova uplata sheet. Selecting a client
populates `form.clientUserId` (and the displayed name) and closes the picker,
returning to the Nova uplata form.

- Reuse `<ClientPicker mode="free" bottomSheet>` for the picker sheet — it
  already does server-side search + pagination, so this also removes the eager
  client fetch.
- The picker sheet must stack over the Nova uplata sheet (`stackBehavior="push"`
  on the outer sheet, per `AppSheet`'s documented stacking) so closing the
  picker reveals the form rather than flickering it closed.
- Remove the eager-fetch `useEffect` loop (lines 111–115) and the `allClients`
  drain *for the create-payment path*. **Caveat:** `allClients` is also consumed
  by the by-client *filter* Select on the list screen — confirm whether the
  filter still needs the eager set before removing it. If the filter still
  depends on it, keep the drain for the filter and only swap the create-payment
  field. (Decide during implementation by reading the filter usage; default to
  the smaller change — leave the filter as-is — unless trivially safe to migrate
  both.)

**Verification:** Open Naplata → +. Tap the Klijent field → picker sheet opens
on top. Search filters server-side; scrolling paginates. Select a client → picker
closes, name shows in the form. Submit creates the payment for that client.

### i18n note (applies to both PRs)

Any new visible string (e.g. a picker sheet title, "Izaberi klijenta" reuse)
must exist in BOTH `apps/mobile/locales/sr.json` and `en.json`, including a11y
labels. Prefer reusing existing keys (`admin.izvestaji.paketi.flow.pickClient`,
`admin.reservations.pickClient`, etc.) over adding new ones.

---

## SDK-56 regression sweep — results

Requested as a third item. A dedicated scan of the SDK 54→56 migration found
**no additional code-level UX regressions** beyond A1 and A2. The codebase is
defensively written: nested-Pressable bubbling is already guarded elsewhere,
moti × reanimated-4 usages avoid the breaking patterns (no `AnimatePresence` /
`exit` / stagger), gesture-handler raw API is unused, and the provider tree
ordering is correct.

**One manual-verify item (not a code change):**
`react-native-modal-datetime-picker` drives
`@react-native-community/datetimepicker` across a **major bump (8→9)**. Used in
~9 native flows (DOB / date / time pickers: client create/edit, new/edit
session, assign-package, campaign compose). Not covered by the web e2e suite.
**Action:** manual native pass of the date/time pickers before deploy — this is
a verification task, tracked in PR A's description, not a code fix.

---

## Testing

Per AGENTS.md, before each PR goes up, run locally from `apps/mobile`:
`pnpm lint && pnpm check-types && pnpm test:unit`, then
`pnpm test:db:prepare && pnpm test:integration`, then
`pnpm test:e2e:prepare && pnpm test:e2e`. The skeleton/picker/animation changes
are RN-native-leaning; confirm no e2e (web) spec regressions, especially around
the Naplata create-payment flow and any sheet-timing specs touched by the SDK-56
migration.

## Out of scope

- Server-side aggregate for StatStrip totals (pre-existing TODO in
  `naplata/index.tsx`, unrelated).
- Redesigning skeletons that already match their content.
- Any non-UX SDK-56 cleanup.
