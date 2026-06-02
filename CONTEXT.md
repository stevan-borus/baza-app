# Baza Pilates

A booking app for a Pilates studio. Admins manage the catalog and schedule, trainers run sessions and keep notes per client, clients buy session packages and book classes.

## Language

### People

**Admin**:
A studio operator. Manages ClassTypes, Rooms, PackageTypes, the schedule, and clients. One per studio in practice.
_Avoid_: Owner, manager.

**Trainer**:
A coach who runs Sessions. Sees only their own scheduled Sessions and only Clients they're linked to via past or upcoming Bookings.
_Avoid_: Coach, instructor.

**Client**:
A studio member. Buys ClientPackages and uses them to book Sessions. Has an optional `dateOfBirth` (civil date — month + day are what we act on; year is stored for future age-aware features).
_Avoid_: User, customer, member, account holder.

**User**:
A row in the auth table — has email, password, role (`ADMIN | TRAINER | CLIENT`). Every Client / Trainer / Admin is a User; the converse is true. A `ClientProfile` row hangs off Users with `role = CLIENT`.
_Avoid_: Account.

### Catalog

**ClassType**:
A kind of class — Reformer pilates, Energy pilates, Moms&Minis, Golden age. Carries default capacity, duration, and late-cancel window.

**PackageType**:
A SKU — e.g. "Reformer 12-pack / 30 days". **Scoped to exactly one ClassType** (since `package-class-scoping`); a 12-pack of Reformer can't be used to book Energy.

**ClientPackage**:
An instance of a PackageType bought by a Client. Carries `sessionsRemaining`, `expiresAt`, and **snapshots** the PackageType's `classTypeId` + `lateCancelHours` at purchase time so future PackageType edits don't retroactively change existing packages.
_Avoid_: Pack, subscription.

**StudioRoom**:
A physical room. Sessions happen in one room.
_Avoid_: Studio, location.

### Scheduling

**Session**:
A scheduled class — `(classType, room, trainer, startsAt, endsAt, capacity)`. Sessions are created singly or via a recurring series.

**Recurring series**:
A set of Sessions generated from a weekday pattern (e.g. Mon/Wed/Fri × 4 weeks). Each occurrence is an editable Session; edits can target one occurrence or the whole series.

**Booking**:
A Client claiming a slot in a Session. Decrements the matched ClientPackage's `sessionsRemaining` (or doesn't, depending on cancellation timing — see below). Can be created by the Client (via `POST /bookings`, gated by `no_package_for_class`) or by an **Admin** (via the admin booking path, which **skips** the package-eligibility check — see **Admin reservation**).

**Admin reservation**:
A Booking created by an Admin on behalf of a Client to hold a seat. Identical to a self-booked Booking in every downstream system (capacity, waitlist, late-cancel, calendar visibility, client cancel rights) — the *only* differences: (1) the admin path skips the booking-time package check, so `clientPackageId` may be `null` at creation; (2) the Booking carries an audit pointer to the creating Admin. Admins can reserve arbitrarily far into the future. The cron at session-end late-binds a package if one is eligible; if not, it records `NO_PACKAGE` and notifies admins (push + in-app) that the Client attended an unbacked session. Used to lock in long-term Clients whose weekly Session mix varies.

The ClassType scoping rule (a Reformer ClientPackage cannot back an Energy Booking) is **not enforced** as a hard rule on Admin reservations — but the admin UI shows a **soft warning** at confirmation time when the Client owns no package for the target ClassType, and the **Pattern reservation** confirmation surfaces a per-ClassType breakdown (e.g. "152 selected: 100 Reformer / 52 Energy — Marija has Reformer only, 52 will be unbacked"). The warning is informational; the admin can proceed.

Creation lives on **one screen**: the admin schedule (existing `pregled` calendar) in reservation mode, with a persistent client-selection banner and a selection toolbar. The **only** entry point is the Client profile's "Reserve sessions" action — the screen is never reachable with no client picked, so the banner is always bound. The route is **admin-only**; trainers and clients hitting it are redirected. Under the hood, every reservation is the same gesture: a set of selected `sessionId`s submitted to a single endpoint (`POST /admin/reservations`).

Selection is built from two interchangeable inputs that both feed the *same* selection set:
- **Tap selection** — Admin taps individual Session cards in the calendar to toggle them. Past Sessions are selectable too (admins routinely backfill).
- **Pattern overlay** — A power-tool sheet ("Apply pattern…") with two rhythms:
  - **Weekly**: pick weekday(s) + time-of-day + N-week range. Applies the same set every week.
  - **Biweekly**: pick a "Week A" set + a "Week B" set, each with its own weekdays and time. Alternates A/B/A/B across the range. Week A is anchored to the week the range begins in — there is no week-offset toggle; admins reframe by shifting the start date.
  Sessions that don't exist yet (recurring schedule hasn't been materialised that far) are silently skipped; the admin re-runs after extending. The biweekly rhythm exists for the realistic alternating-shift case (e.g. Marija comes Mon/Wed/Fri 7am one week, Tue/Thu 6pm the next). 3+ week rotations are out of scope — admin falls back to tap-select.

The day list is filterable by **ClassType** chips (All / Reformer / Energy / Moms&Minis / Golden age) so admins picking a specific kind don't have to scan past other class types.

Capacity conflicts are visible **in the calendar during selection**, not summarised after. Full Sessions render with a distinct unavailable treatment in reservation mode and are unselectable; when the pattern overlay matches a full Session, the card highlights in a conflict color rather than the normal selection color. The Client is never auto-waitlisted by a reservation gesture — admin decides per-Session whether to manually waitlist.

_Avoid_: "Hold", "block", "standing booking". The word is **reservation** when admin-initiated, **booking** in all other contexts; storage is one `Booking` table.

**Late-cancel cutoff**:
The point before which a cancellation is "free" (no consumption) and after which it forfeits the session. Resolved per ClientPackage from its snapshotted `lateCancelHours`.

**Waitlist**:
The queue on a full Session. When someone cancels, the next waitlisted Client is auto-booked and notified.

### Billing

**Naplata** (the section): the admin-facing list of past payments, plus the entry point for **Nova uplata**.

**Nova uplata** (Flow 1, atomic):
The default assignment path. Admin records a payment for a Client → a BillingRecord and a ClientPackage are created in the same transaction. Reachable from (a) the Naplata header `+` (no pre-filled client) and (b) a client row's primary action (client pre-filled).
_sr_: "Nova uplata" — _en_: "New payment".

**Poklon paket** (Flow 2, comp):
Admin assigns a free / complimentary ClientPackage directly with no BillingRecord — used for family / friends. Reachable as a secondary action on a client row, never from Naplata.
_sr_: "Poklon paket" — _en_: "Complimentary package". _Avoid_: "komp paket" (colloquial Serbian, was the old label).

**BillingRecord**:
A row of money received. Always paired with a ClientPackage in Flow 1 (Nova uplata). Carries `packageTypeId` (nullable — non-null on Flow 1, null on legacy / non-package payments) so revenue-per-PackageType reporting joins cleanly without inferring from timestamps.

### Trainer notes

**TrainerNote**:
Free-text observation a Trainer writes about a Client. Optionally attached to a specific Session — session-less TrainerNotes hold general client context (e.g. an injury history note that isn't tied to one class). The authoring Trainer can read, edit, and delete their own TrainerNotes. Admins can read every TrainerNote about every Client. Clients **never** see TrainerNotes — if a future product need calls for client-visible observations, that is a new concept and a new domain term, not a flag on this one.
_Avoid_: "Note" alone (overloads with the `pause.reason` field, commit notes, and the `editForm.notes` admin form input); "comment"; "client log".

### Cron

**`cron:sessions`**:
Runs after a Session ends. Scans only **still-active** Bookings (`canceledAt IS NULL`) and decrements `sessionsRemaining` for each — there is no attendance marking, so an uncancelled Booking at session-end *is* a consumed Booking. This is how a **no-show** (Client who neither cancelled nor came) forfeits the session. The cron never touches a cancelled Booking: the late-cancel forfeit is applied **synchronously at cancel-time** in the cancel endpoints (`POST /bookings` cancel and `POST /admin/reservations/cancel-bulk`), not here. So early cancels are free, late cancels are forfeited at cancel-time, and the cron's job is purely to charge the no-shows. Unbacked Admin reservations that reach the cron uncancelled get late-bound to an eligible package (or recorded `NO_PACKAGE`).

**`cron:reminders`**:
Sends notifications about upcoming Sessions to booked Clients.

**`cron:package-expiry`**:
Sends notifications when a Client's ClientPackage is N days from `expiresAt`.

### Notifications

**Cancellation notification**:
Every single-Booking cancellation generates a NotificationLog row for **all admins** and for **the Session's assigned Trainer**. Late cancellations (per `shouldApplyLateCancelPenalty`) trigger an Expo push; early cancellations are silent in-app (NotificationLog created, no push). If a Trainer is also an Admin, they receive only the Trainer-flavored notification. The waitlist auto-promotion notification to the promoted Client is unrelated and unchanged. For **Bulk reservation cancel** the fan-out collapses (see that entry).

**Bulk reservation cancel**:
An admin gesture that cancels N Bookings for one Client in a single transaction (e.g. cancelling all the Mon/Wed/Fri 7am reservations during a Client's travel weeks). One dedicated endpoint, atomic. Per-Booking, the late-cancel penalty applies exactly as it would for a Client-initiated cancel **unless the admin invokes a charge waiver** (see **Charge waiver**); for the typical unbacked **Admin reservation** there's no `clientPackageId` to forfeit, so it's consequence-free in that common case regardless. Waitlist promotion runs per Session as usual. Notification fan-out collapses to **one notification per recipient per bulk action** (one per other admin, one per affected trainer, none to the initiating admin) instead of one-per-cancelled-Booking; the promoted-client `BOOKING_CONFIRMED` push coalesces per `userId` if the same Client is promoted from multiple Sessions in the same bulk action.

**Charge waiver**:
An Admin's deliberate decision, at cancel-time, to forgive the late-cancel forfeit for a specific Booking — used when a Client legitimately can't attend and tells the studio out-of-band (a text, a call) too late to fall before the late-cancel cutoff. Expressed as a per-cancel **"don't charge this session" toggle, defaulting OFF**, on both admin cancel surfaces (the **Bulk reservation cancel** confirm and the quick single cancel on the admin session-detail roster). When on, the cancel **skips the forfeit entirely** — no `SessionConsumption` row, no `sessionsRemaining` decrement — and stamps the Booking's `waivedByUserId` with the acting Admin (the "when" is `canceledAt`). The waiver only has teeth on a **late, package-backed** Booking; an early cancel or an unbacked **Admin reservation** is already consequence-free, so the toggle is a no-op there. A waiver never affects a **no-show**: a Booking left uncancelled is still charged by `cron:sessions` at session-end. The audit column exists to make studio generosity visible and deter habitual over-use.
_Avoid_: "refund" (nothing is charged then given back — the forfeit is skipped), "free cancel", "comp cancel".

**Unbacked-attendance notification**:
When `cron:sessions` processes a completed Booking and resolves no eligible ClientPackage (`NO_PACKAGE` outcome), all admins receive both a push and an in-app NotificationLog naming the Client + Session. Used to surface long-term Clients with **Admin reservation** bookings who are attending without paying for a covering package — the admin then decides whether to sell a package, comp one, or cancel the remaining reservations.

### Test fixtures

**Rich seed**:
The deterministic dataset every test resets to before running. Defined in `apps/mobile/scripts/test/seed-e2e.ts`. Each test layer applies it on its own boundary (per Vitest integration file, per Playwright spec file, per Maestro flow).

**Client matrix**:
The 6-Client shape inside the rich seed, named to make package-state coverage obvious in test output:
- `client.active.reformer@e2e.test` — active Reformer 12-pack with 8 remaining
- `client.active.energy@e2e.test` — active Energy 12-pack
- `client.expired@e2e.test` — Reformer pack expired 7 days ago
- `client.paused@e2e.test` — Reformer pack inside an active pause window
- `client.future@e2e.test` — Reformer pack `startsAt` is 7 days from now
- `client.empty@e2e.test` — no packages at all

**Anchor time**:
A fixed instant the entire stack (seed, server, helpers, browser, integration tests) is pinned to so date-dependent tests don't drift over wall-clock time. The current anchor is `2026-05-11T09:00:00Z` (Monday morning, just before the 10:00 seeded session) — picking a Monday means the seeded weekly schedule (Reformer Mon/Wed/Fri, Energy Tue/Thu) all fall inside the visible week. Toggle via the `TEST_ANCHOR_TIME` env var — set to a parseable ISO string to override, leave unset for production / wall-clock behaviour. Server, seed, helpers and Vitest setup all read it through `apps/mobile/lib/now.ts` (`now()` / `nowMs()`); Playwright additionally pins the browser clock via `page.clock.install` in the e2e fixture. Maestro flows still use the device's wall clock — keep date-relative assertions out of Maestro.

## Relationships

- A **Client** owns zero or more **ClientPackages**; each is scoped to one **ClassType**.
- A **Session** has one **ClassType**, one **StudioRoom**, one **Trainer**, and zero-or-more **Bookings**.
- A **Booking** matches a **Client**'s eligible **ClientPackage** for the **Session**'s **ClassType**. No match → 409 `no_package_for_class`.
- A **Trainer** can only see **Clients** they've been linked to via at least one **Booking** in a **Session** they're assigned to.
- A **Note** belongs to one **Trainer**, one **Client**, and one **Session**.
- **Flow 1** creates a **BillingRecord** and a **ClientPackage** atomically. **Flow 2** creates only a **ClientPackage**.

## Example dialogue

> **Dev:** "When a **Client** books a **Session**, which **ClientPackage** gets decremented?"
> **Domain expert:** "Whichever active, non-expired **ClientPackage** they own that's scoped to the **Session**'s **ClassType**. If they have multiple eligible ones, the oldest by `startsAt`. If none — 409, the booking is rejected."
> **Dev:** "And the package's **late-cancel cutoff** — does that come from the current **PackageType** or the **ClientPackage** itself?"
> **Domain expert:** "The **ClientPackage** — it snapshots `lateCancelHours` at purchase time. If the studio later edits the **PackageType**'s window, in-flight **ClientPackages** keep their original window."

## Flagged ambiguities

- "user" was used to mean both **User** (auth row) and **Client** (the studio-domain person). They're distinct: every Client is a User but not every User is a Client. Spec / API code refers to `userId` for the auth row and `clientProfileId` for the Client.
- "package" was used to mean both **PackageType** (the SKU) and **ClientPackage** (an instance owned by a Client). Always say which.
- "session" overloads with the auth concept (a logged-in browser session). In this domain, **Session** is always the class. Auth sessions are referred to as "sign-in" / "auth session" in code.
