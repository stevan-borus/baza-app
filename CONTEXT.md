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
A studio member. Buys ClientPackages and uses them to book Sessions.
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
A Client claiming a slot in a Session. Decrements the matched ClientPackage's `sessionsRemaining` (or doesn't, depending on cancellation timing — see below).

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
A row of money received. Always paired with a ClientPackage in Flow 1 (Nova uplata).

### Trainer notes

**Note**:
Free-text observation a Trainer writes about a Client, attached to a specific Session. Visible only to the writing Trainer and Admins.

### Cron

**`cron:sessions`**:
Runs after a Session ends. Decrements `sessionsRemaining` for confirmed attendees. Skips Bookings cancelled before the late-cancel cutoff. Decrements (forfeits) Bookings cancelled after the cutoff.

**`cron:reminders`**:
Sends notifications about upcoming Sessions to booked Clients.

**`cron:package-expiry`**:
Sends notifications when a Client's ClientPackage is N days from `expiresAt`.

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
A fixed instant the entire stack (seed, server, helpers, browser/native clock) would be pinned to so date-dependent tests don't drift over wall-clock time. **Not implemented yet** — date-touching specs currently read `new Date()` and stay green only if they're run on a day where the seed produces the right Sessions. When in doubt, sanity-check that a new date-touching spec would still pass if run next Saturday.

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
