# Fix: English error message leaking to UI under Serbian (the 502 report)

> **STATUS: DONE.** `formatMutationError` now returns the localized fallback for
> any unrecognized error (both the non-ApiError branch and the unrecognized
> ApiError branch); dead `isRawValidationMessage` helper removed. Tests corrected
> to assert the new contract + a 502 repro test added. Verified: unit 496/496,
> lint 0 errors, `pnpm check-types` clean.

## What the user saw
Adding a repeating session → **502** + an **English** error message, while the app
was set to **Serbian**.

## Root cause (two separate things)

### A. The i18n leak — this is the actionable bug
`apps/mobile/lib/admin/format-mutation-error.ts` returns **raw English** to the UI
for any error it doesn't recognize as a *structured schedule-conflict body*:

- **502 / network drop / unreadable body** → `apiRequest` throws
  `ApiError(502, null, "Unable to create recurring sessions (502)")`. The function
  hits its final `return error.message || fallback` (line 157) and returns that
  **English literal** — the localized `fallback` (`t("admin.schedule.createError")`)
  is only used when `error.message` is empty, which it never is.
- **Server 4xx** (`"Invalid payload"`, `"Invalid startsAt date"`, …) → same path,
  returns the server's hardcoded English string.
- **Non-ApiError** (e.g. `"Network request failed"`) → line 112 returns
  `error.message`, English.

So the localized fallback every caller already passes is effectively dead code for
the common failure paths. That is exactly why an English message appeared under a
Serbian UI.

### B. The 502 itself — infrastructure, not app code
Sentry (baza-server / baza-mobile) has **no** capture for this POST. The only
recent server issue is `Error: Premature close` on `GET /api/health` — a Fly
healthcheck probe (response 200), unrelated. No server exception for the recurring
POST means the app process didn't throw; the 502 came from the **gateway/proxy
layer** (timeout or dropped connection). We cannot pin it down further without a
live repro, and it is *separate* from the language symptom. Out of scope for this
fix beyond documenting it.

## Decision (confirmed with user)
**Always localized fallback.** Any error that is not a recognized structured,
already-localized message → return the caller's localized `fallback`. Raw
server/exception English must never reach the user.

Structured schedule-conflict bodies (single + recurring) stay exactly as-is —
they're already built from `t(...)` keys.

## Scope check — other leak sites (the "check all other places" ask)
Swept `app/` + `components/`:
- `sign-in.tsx` — renders `t("auth.signInError")` regardless of thrown message. ✅ safe.
- `use-booking-sheet.tsx` — maps structured `code`, never shows `error.message`. ✅ safe.
- All other `ErrorState` usages render `t(...)` keys directly. ✅ safe.

**`formatMutationError` is the only leak.** Fixing it fixes every mutation surface
that routes through it (new-session sheet, session-edit sheet, notes feed).

## Implementation (TDD — red → green → refactor)

### 1. Update the test contract (the current tests assert the BUG)
`apps/mobile/test/unit/format-mutation-error.test.ts` currently asserts the leaky
behavior and must be corrected — these were testing the wrong contract:
- `"returns a non-ApiError Error's own message…"` (expects `"Network request failed"`)
  → now expects `FALLBACK`.
- `"returns the server's error string for a generic 4xx…"` (expects `"Invalid payload"`)
  → now expects `FALLBACK`.

Add new assertions:
- 502-style `ApiError(502, null, "Unable to create recurring sessions (502)")`
  → returns `FALLBACK` (never the English `(502)` string). **This is the repro test.**
- `ApiError(400, { error: "Invalid startsAt date" }, …)` → returns `FALLBACK`.
- A recurring schedule-conflict body still returns the detailed localized string
  (unchanged — keep/confirm existing coverage).
- Empty/plain error still returns `FALLBACK`.

Run `pnpm --filter mobile test:unit` → the two edited tests + new 502 test FAIL (red).

### 2. Make the change
In `format-mutation-error.ts`:
- **Non-ApiError branch** (currently lines 110–113): drop the
  `error instanceof Error ? error.message : fallback` leak. Return `fallback` for
  anything that isn't a recognized localized message. (Keep the `isRawValidationMessage`
  guard as redundant defense, or fold it in — the result is the same `fallback`.)
- **ApiError unrecognized branch** (currently line 152–157): after the two conflict
  guards, return `fallback` instead of `error.message`.
- Update the function's doc comment: it no longer surfaces the server's `error`
  string verbatim; unrecognized errors get the localized fallback so the UI language
  always matches the app.

Run `pnpm --filter mobile test:unit` → green.

### 3. Verify
- `pnpm lint && pnpm check-types` (root: `pnpm check-types`) — clean.
- Manually reason through the three caller sites (new-session, session-edit,
  notes-feed): all already pass a localized `fallback` + `lang`, so no caller
  changes needed.

## Out of scope / follow-up
- The **502 infrastructure cause** (Fly gateway timeout/drop) — not reproducible
  from here, nothing in Sentry. If it recurs, capture the failing request's timing
  and check Fly proxy logs. Noted, not fixed here.
- No new locale keys needed — every caller already has its localized fallback key.

## Files touched
- `apps/mobile/lib/admin/format-mutation-error.ts` (the fix)
- `apps/mobile/test/unit/format-mutation-error.test.ts` (corrected contract + repro test)
