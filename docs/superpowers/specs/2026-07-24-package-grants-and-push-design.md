# Package grants & assignment push — design

Date: 2026-07-24 · Branch: `feat/package-grants-and-push` · Status: approved by owner

Three independent features, landed as three commits on one branch, in this order:

1. **"+1 termin"** — admin restores a session to a client's package (justified absence after the no-show charge).
2. **Push on package assignment** — client gets a push/in-app notification for both naplata and dodeli.
3. **Birthday gift: one SKU + class-type picker** — stop requiring one 🎂 gift SKU per class type.

Background mechanics (verified): `sessionsRemaining` is debited at consumption time, not booking time — late-cancel forfeit or the session-end no-show cron (`lib/server/booking-cancellation.ts`). `SessionConsumption` does not record which package was charged. Birthday gift assignment already pushes the client (`BIRTHDAY_CLIENT_GIFT`).

## 1. "+1 termin" on a client package

**API** — new route `POST /api/packages/client-packages/[id]/add-session`, ADMIN only (deliberately not trainers — goodwill credits are an owner decision).

Guards, in order:
- package exists → else 404
- not revoked (`revokedAt` null) and not expired (`expiresAt` in the future, `lib/now`'s `now()`) → else 409 with a clear conflict message. Rationale: an expired package can't absorb a useful credit; rejecting keeps the admin from believing it worked. The rare expired case keeps the existing 1-session-package fallback.

Effect: `sessionsRemaining += 1` (single increment per call). Response: the updated package (same shape as the existing client-packages responses). Route must be registered in `server/routes-registry.ts` and get a Zod response schema in `@baza/types`.

**UI** — admin client detail, package card: a "+1 termin" action with a confirm step (existing confirm pattern). Visible only on active (non-revoked, non-expired) packages. Mutation lives as a hook in the packages queries-factory with standard invalidations. Copy in BOTH `locales/sr.json` and `locales/en.json`.

**Explicitly out of scope:** no client notification for the +1 (add later if asked); no expiry extension.

## 2. Push on package assignment

Follows the `CLIENT_EVENT_CHANNELS` registry pattern (`lib/server/client-event-channels.ts`). Two new client events, **in-app/push channel only, no email**:

| Event | Dispatch site | Copy (sr) |
|---|---|---|
| `PACKAGE_PURCHASED` | naplata: `server/routes/billing.ts` POST | "Uplata je evidentirana — paket {name} je aktivan." |
| `PACKAGE_ASSIGNED` | non-gift dodeli branch: `server/routes/packages/client-packages.ts` POST | "Dodeljen vam je paket {name}." |

- The birthday-gift branch keeps its existing `BIRTHDAY_CLIENT_GIFT` push, unchanged.
- Both events share ONE new `NotificationType` enum value: `PACKAGE_ASSIGNED` (drives inbox rendering/tap-routing, identical for both; only message copy differs). Tap → the client's packages view.
- One additive Prisma migration via `prisma migrate dev` (never hand-authored; if the CLI prompts about drift or data loss, STOP and report).
- Message copy (sr + en) in `packages/i18n` notification messages; dispatched fire-and-forget via `void notifyClient(...)` with `packageTypeName` (and whatever vars the copy needs).

## 3. Birthday gift: one SKU + class-type picker

**Server** — `POST /api/packages/client-packages` gains optional `classTypeIdsOverride` (non-empty string array; each id must be an existing ClassType). Honored ONLY when the chosen `PackageType.isBirthdayGift`; reject (400) if supplied for a non-gift type. When present, the created `ClientPackage` snapshots that set instead of the SKU's class-type set (no schema change — the per-package snapshot join rows already support this). The `BIRTHDAY_CLIENT_GIFT` push payload must read the ACTUAL snapshot (`clientPackage.classTypeIds`), not the SKU's set — today it echoes the SKU's set, which would be wrong under an override.

**Notification routing** (`lib/notification-routing.ts`) — stop matching gift SKUs by covered class type. New behavior: if exactly one `isBirthdayGift` SKU exists, preselect it; if several, keep the current includes-match as tiebreak (first match wins, else first gift SKU). Pass the suggestion through as a new `initialClassTypeId` URL param, plumbed through the klijenti deep-link effect into the assign sheet.

**Assign sheet** (`components/admin/assign-package-sheet-content.tsx`) — when the selected package type is a birthday gift, show a single-select class-type picker prefilled from `initialClassTypeId`; admin can change it before confirming. Submit includes the override. Copy in both locale files.

**Operational (owner, post-ship):** keep/create one 🎂 SKU (its own class-type set becomes irrelevant), retire the per-class-type gift SKUs. New class types never require new gift SKUs.

## 4. Counter fix: "+1 termin" must grow the total (owner-reported bug)

Manual QA found `13/12 termina`: every "x/y" site divides by the SKU's live
`sessionCount`, while add-session only bumps `sessionsRemaining`. Owner-defined
semantics: the grant grows the TOTAL — unused 12/12 → +1 → 13/13; one used
(11/12) → +1 → 12/13.

Fix: `bonusSessions Int @default(0)` on `ClientPackage` (additive migration, no
backfill — existing rows have 0 bonus). The add-session route increments
`sessionsRemaining` AND `bonusSessions` in one update. Effective total
everywhere = `packageType.sessionCount + bonusSessions`. Audit EVERY total/
consumption site, server and UI: clients packageStatus shapes, client-detail,
clients/me/packages, packages/client-packages, reports consumption math
(`consumed = sessionCount + bonusSessions - sessionsRemaining`), package-expiry
cron, admin client detail (Pregled + Paketi tabs), client home hero, client
packages screen.

## 5. Built-in system gift (replaces "one SKU" from §3)

Admins should never create ANY gift SKU. A system gift PackageType lives in the
DB: `isSystem Boolean @default(false)` on PackageType (additive migration);
one row (name "🎂 Rođendanski poklon", sessionCount 1, validityDays 30,
lateCancelHours 8 — the catalog form default, isBirthdayGift true, isSystem
true, no price) ensured idempotently server-side so every environment self-
heals (ensure hook on the packages/types read path; concurrent-safe).

- Catalog management (tipovi-paketa) hides `isSystem` rows; the server rejects
  edit/delete of a system row. Paid flows already exclude gifts.
- Comp assign sheet: the system gift appears as an option; picking it shows the
  class-type picker — now MULTI-select (owner decision) — prefilled from
  `initialClassTypeId`; submit sends the picked set as `classTypeIdsOverride`
  (already an array end-to-end). Submit gated on ≥1 picked.
- Notification routing: preselect the system gift deterministically (isSystem
  first, then the existing single/tiebreak fallback for any legacy gift SKUs).
- Legacy admin-created gift SKUs keep working; owners can simply delete them.

## Testing (Testing Trophy — integration first)

- Integration: add-session route (increment, 404, revoked/expired 409, role guard); both dispatch sites create a NotificationLog row with the right type + message vars; classTypeIdsOverride (honored for gift, rejected for non-gift, snapshot + push payload reflect override).
- Component (Vitest Browser Mode): "+1 termin" confirm flow on the package card; gift-mode class-type picker branch in the assign sheet.
- Unit: notification-routing resolution changes.
- TDD (red-green-refactor) throughout; run specs per AGENTS.md gates.
