# Waitlist: honest copy + leave-waitlist — design

**Date:** 2026-07-17
**Status:** Approved (pending spec review)

## Problem

When a client joins the waitlist for a full class, the booking sheet shows two things that read wrong:

1. A green confirmation "Dodati ste na listu čekanja" (You've been added to the waiting list) — correct.
2. A warning "Ovim treningom trošite poslednji termin iz paketa. Obnovite ga…" (With this training you're spending the last session from your package. Renew it…) — misleading. It implies the session was *booked/spent*, when the client only joined a waitlist.

Underneath: joining a waitlist **does** hold a package session — this is intentional (`booking-hold-count.ts` counts future waitlist entries as holds; "a waitlist seat also reserves a session"). The hold model stays. But the client has **no way to leave the waitlist**, so a held session is stranded on a waitlist-only seat until the class ends or an admin intervenes. The CANCEL path only operates on `Booking` rows, never `WaitlistEntry`.

## Decisions (locked with the user)

- **Keep the hold model.** A waitlist seat still reserves a session. Do not change the hold accounting.
- **Fix the copy** so the waitlist confirmation stops implying a completed booking, and points at the escape hatch (you can leave the list to get the session back).
- **Add leave-waitlist.** A dedicated action + button so the client can remove themselves; leaving releases the held session automatically.
- **Confirm step** on leave (mirror the existing cancel-booking confirm flow), not a single tap.
- **Dedicated `LEAVE_WAITLIST` server action** — no forfeit, no promotion — rather than overloading CANCEL.

## Non-goals

- Changing whether a waitlist seat holds a session (explicitly kept).
- Any admin-side waitlist management.
- Late-cancel / forfeit semantics for leaving a waitlist (leaving is always free — a waitlist seat never occupied a real spot).
- Waitlist promotion changes (leaving the list promotes nobody).

## Part A — Honest waitlist copy

The current warning key `client.renewal.lastSessionWarning` is shared by the booking confirm step and the waitlist success block. Keep it for the booking case; add a waitlist-specific variant.

- **New i18n key** `client.renewal.lastSessionWaitlistWarning` in BOTH `apps/mobile/locales/sr.json` and `en.json`.
  - sr: reserves-not-spends framing + escape hatch. e.g. "Ovim mestom na listi čekanja rezervišete poslednji termin iz paketa. Ako se mesto ne oslobodi, možete napustiti listu i vratiti termin."
  - en: "This waitlist spot reserves the last session in your package. If a spot doesn't open, you can leave the list to get it back."
- **`components/client/booking-sheet.tsx`** success block (currently lines ~414–425): branch the warning text on `successState`:
  - `WAITLISTED` → `client.renewal.lastSessionWaitlistWarning`
  - `BOOKED` → `client.renewal.lastSessionWarning` (unchanged)
  - The render condition (`bookedLastSlotRef.current && (BOOKED || WAITLISTED)`) is unchanged; only which string renders.

No behavior change in Part A.

## Part B — Leave waitlist

### Wire types — `packages/types/src/bookings.ts`

- `bookingActionSchema`: `["BOOK", "CANCEL", "LEAVE_WAITLIST"]`.
- `bookingMutationResultSchema.state`: add `"LEFT_WAITLIST"`.

### Availability payload — `packages/types/src/scheduling.ts` + `server/routes/sessions/availability.ts`

- Add optional `isWaitlistedByMe: z.boolean().optional()` to the session schema (mirrors `isBookedByMe`).
- In `availability.ts` (CLIENT branch, alongside `myBookings`): build `myWaitlistedSessionIds` from `prisma.waitlistEntry.findMany({ where: { clientProfileId, sessionId: { in: … } }, select: { sessionId: true } })`. Populate `isWaitlistedByMe: myWaitlistedSessionIds.has(session.id)` in the response map.

### Server handler — `server/routes/bookings.ts`

New `action === "LEAVE_WAITLIST"` branch (before or after the BOOK block; it does not need the session-in-past guard — leaving is allowed any time):

- Delete the caller's waitlist entry: `prisma.waitlistEntry.deleteMany({ where: { sessionId, clientProfileId } })`.
- Idempotent: zero rows deleted is still `success: true`.
- No forfeit (a waitlist seat never consumed a real spot).
- No promotion (`promoteNextWaitlistEntry` runs only when a *booked* spot frees up; leaving the waitlist frees no booking).
- The held session is released automatically: hold count derives from live `WaitlistEntry` rows, so removing the row drops `heldCount` and restores `bookableSessions` on the next availability read.
- Return `{ success: true, state: "LEFT_WAITLIST" }`.

Optional: notify operators is **not** required for a self-initiated leave (mirrors the "no notification for self-initiated bookings" rule in the same file). Confirm during implementation; default is no notification.

### Client mutation — `lib/queries/bookings-queries-factory.ts`

- Extend the mutation's action union to include `"LEAVE_WAITLIST"`.
- Reuse the existing `useMutateBookingMutation` (same `onSuccess` invalidations — availability + any package/bookable queries) rather than a separate hook, since it already invalidates the right caches for book/cancel and leave needs the identical set.

### Success-state mapping — `lib/booking-success-state.ts`

- Map server `LEFT_WAITLIST` → a `LEFT_WAITLIST` success UI state.

### Sheet UI — `components/client/booking-sheet.tsx` + `use-booking-sheet.tsx`

- New derived flag `isWaitlistedByMe = !!session?.isWaitlistedByMe`.
- **Idle step, when `isWaitlistedByMe`** (takes precedence over the `isFull` join-waitlist button): render a "you're on the waitlist" state with a "Napusti listu čekanja" button (`client.dayView.leaveWaitlist`, already present in both locales) that sets `step = "confirmLeaveWaitlist"`.
  - Reuse the existing green "Dodati ste na listu čekanja" affordance / an on-waitlist status line for the confirmation-of-membership; exact copy chosen at implementation (an existing "on the waitlist" string or a new `client.dayView.onWaitlist` key if none fits).
- **New confirm step `confirmLeaveWaitlist`**: mirror `confirmCancel` — a heading ("Napusti listu čekanja?"), a `Potvrdi` (variant danger) that fires `onLeaveWaitlist(session.id)`, and a `Nazad` ghost back to idle. Reuse existing `common.back`. New key `client.dayView.confirmLeaveWaitlist` if no existing heading fits.
- **Success block**: `successState === "LEFT_WAITLIST"` → message `client.calendar.waitlistLeft` (new key, e.g. "Napustili ste listu čekanja" / "You left the waitlist"), neutral (info) styling like CANCELED.
- `use-booking-sheet.tsx`: add `onLeaveWaitlist` that calls `mutation.mutate({ sessionId, action: "LEAVE_WAITLIST" })`, and extend `mapResultStateToSuccessState` for `LEFT_WAITLIST`.

## New i18n keys (both `sr.json` and `en.json`)

| Key | sr (draft) | en (draft) |
|---|---|---|
| `client.renewal.lastSessionWaitlistWarning` | "Ovim mestom na listi čekanja rezervišete poslednji termin iz paketa. Ako se mesto ne oslobodi, možete napustiti listu i vratiti termin." | "This waitlist spot reserves the last session in your package. If a spot doesn't open, you can leave the list to get it back." |
| `client.dayView.confirmLeaveWaitlist` | "Napusti listu čekanja?" | "Leave the waitlist?" |
| `client.calendar.waitlistLeft` | "Napustili ste listu čekanja" | "You left the waitlist" |
| `client.dayView.onWaitlist` *(if needed)* | "Na listi ste čekanja" | "You're on the waitlist" |

`client.dayView.leaveWaitlist` already exists in both locales (currently orphaned).

## Testing (Testing Trophy — integration first)

### Integration (`apps/mobile/test/integration/`) — real DB, real route handler

1. **LEAVE_WAITLIST removes the entry and releases the hold.** Seed a client on the last package session, waitlisted on a full class. Call the booking route with `LEAVE_WAITLIST`. Assert: the `WaitlistEntry` row is gone; a subsequent availability read shows the session as bookable again (`bookableSessions` restored / `lastBookableSlot` reflects the freed hold).
2. **Idempotent leave.** Call `LEAVE_WAITLIST` twice; second returns `success: true, state: "LEFT_WAITLIST"` with no error, no side effects.
3. **Leave promotes nobody / no forfeit.** With another client also on the waitlist below, leaving the list does not promote them and does not create a `SessionConsumption`.
4. **`isWaitlistedByMe` surfaces in availability.** A waitlisted client's availability payload sets `isWaitlistedByMe: true` for that session and `false` elsewhere; a non-waitlisted client sees `false`.

### E2E (`apps/mobile/test/e2e/`) — Playwright

5. **Join → leave round trip.** Client joins the waitlist on a full class, sees the reserves-not-spends copy (`lastSessionWaitlistWarning`, gated to the last-slot case), reopens the sheet, sees the "Napusti listu čekanja" button, confirms leave, sees "Napustili ste listu čekanja", and the session is bookable again.

Follow project anti-flake rules (wait for state, `navigateWeekStripTo`, deterministic anchor time). Run the full local gate before the PR (lint + types + unit, then `test:db:prepare` + integration, then `test:e2e:prepare` + e2e).

## Files touched

- `packages/types/src/bookings.ts` — action + result-state enums
- `packages/types/src/scheduling.ts` — `isWaitlistedByMe`
- `apps/mobile/server/routes/bookings.ts` — `LEAVE_WAITLIST` handler
- `apps/mobile/server/routes/sessions/availability.ts` — `myWaitlistedSessionIds` + payload field
- `apps/mobile/lib/queries/bookings-queries-factory.ts` — action union
- `apps/mobile/lib/booking-success-state.ts` — `LEFT_WAITLIST` mapping
- `apps/mobile/components/client/booking-sheet.tsx` — waitlist-copy branch + leave button + confirm + success
- `apps/mobile/components/client/use-booking-sheet.tsx` — `onLeaveWaitlist` + state mapping
- `apps/mobile/locales/sr.json`, `apps/mobile/locales/en.json` — new keys
- Tests under `apps/mobile/test/integration/` and `apps/mobile/test/e2e/`
