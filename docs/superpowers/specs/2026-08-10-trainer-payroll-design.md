# Trainer payroll — monthly compensation from attended sessions

**Status:** approved design, ready for planning
**Date:** 2026-08-10

## Why

The studio pays each trainer a percentage of the value of the sessions they
actually held. Today that calculation happens by hand: the owner has no way to
pull "in July, trainer X held these sessions, these clients attended, on these
packages". The client's own words:

> trebalo bi da moze da se izvuce neki pregled tipa na mesecnom nivou, po
> treneru koje je sve termine drzao, ko je od vezbaca bio u tim terminima i sa
> kojim paketima […] Idealno bi bilo da i trener sam to vidi u aplikaciji
> kolko je zaradio u tom mesecu

Two audiences, one calculation: the owner needs an auditable monthly breakdown
to pay from, and the trainer needs to see their own earnings.

## The formula

Per attending booking:

```
per-session value = packageType.price / (sessionCount + bonusSessions)
```

Sum over a session's attending bookings → session gross. Trainer payout =
session gross × trainer percent.

Worked against the owner's handwritten example (a session with 3 clients: two
on a 15.000 / 12-session package, one on an 11.000 / 8-session package):

```
15.000/12 = 1.250    11.000/8 = 1.375
1.250 + 1.250 + 1.375 = 3.875 RSD gross
```

`bonusSessions` is in the divisor because this project's "+1 termin" grants grow
a package's total (a 12/12 becomes 13/13, see #133). Dividing by the raw SKU
`sessionCount` would overpay slightly on granted packages.

**One flat percent per trainer** — not per class type. Owner-confirmed.

### What counts as attendance

A `Booking` with `canceledAt: null`, on a `Session` whose `startsAt` is in the
past and whose `status` is not `CANCELED`.

This deliberately includes charged no-shows. Owner's rule: *"yes, since we take
that session from their package if they dont cancel on time"* — if the package
was charged, the trainer is paid. The schema cannot distinguish a no-show from
an attendee anyway; a late cancel leaves the booking uncanceled precisely so it
still consumes.

## Gifts: assign a real package, flagged as a gift

### The problem with today's model

Gift packages are currently their own `PackageType` SKUs (`Rođendanski paket
(reformer)`, `Nadoknada (energy)`, the system `🎂 Rođendanski poklon`), all with
`sessionCount: 1` and `price: NULL`. They are unvaluable: there is no price, and
no stored link to the paid package they conceptually stand in for.

Valuing them by inference was explored and rejected. Every rule needed an
arbitrary choice, because a class type is covered by several packages at
different rates — Reformer pilates alone is served by Reformer 12 (1.250),
Reformer 8 (1.375), Energy (1.083) and BAZA mix (1.250). Taking the max
overshoots badly (Reformer Personal values a group session at 2.500); taking an
in-session average invents a rate nobody paid.

### The model

Extend the pattern PR #133 established. #133 removed per-class-type gift SKUs by
letting the admin pick the *class type* at assign time (`classTypeIdsOverride`).
This does the same one level up: the admin picks **an existing paid package** and
assigns it as a gift.

`ClientPackage` gains `isGift: Boolean @default(false)` while keeping its real
`packageTypeId`. A gift is a genuine Reformer 12 — real price, real
`sessionCount` — flagged as not paid for.

Consequences, all of them good:

- **Valuation disappears as a problem.** A gift session is worth
  `15.000 / 12 = 1.250`, read like any other package. No special case in the
  payroll code.
- **Make-up (`Nadoknada`) sessions work the same way.** Owner: *"if the package
  is 8 pack it should count like that."* Assign the 8-pack as a gift.
- **Gift SKUs get retired.** Nothing left to price; the "every SKU needs a price"
  problem shrinks to real sellable SKUs, which all already have one.
- `isGift` drives client-facing "poklon" copy, keeps the package out of revenue
  (no `BillingRecord`, which is already how gifts behave), and marks the line in
  the trainer breakdown so the owner can see what the house absorbed.

### Session count defaults to 1

Assigning "Reformer 12 as a gift" must not hand over 12 free sessions. The
assign sheet defaults the gift to **1 session** while inheriting the package's
per-session price; the admin can raise it. Owner-confirmed.

This means `ClientPackage.sessionsRemaining` no longer always derives from
`packageType.sessionCount`, so the gift path needs an explicit
`sessionsGranted`-style override in `createClientPackageFromType`. The existing
`sessionsTotal = sessionCount + bonusSessions` computation (#133) must account
for gifts, or every "x/y" site will render a 1-session gift as "1/12".

### Price becomes required

`PackageType.price` goes non-null for real sellable SKUs. All 8 in use on
staging already have a price, so there is nothing to backfill; the catalog form
starts requiring it. The retired gift/`Nadoknada` SKUs are the only null rows.

### Migrating existing gifts

Staging holds 10 gift packages pointing at unpriced 1-session SKUs: 6 ×
`Rođendanski paket (reformer)` and 4 × system `🎂 Rođendanski poklon`. Owner
decided to **remap** rather than start clean. They are repointed at `Reformer
12` with `isGift: true` and their granted count preserved at 1, so historical
gifts value at 1.250 rather than 0. None of them has a booking against it
(verified), so no payroll figure changes retroactively.

## Payroll module

A live query would be wrong: editing a package price or revoking a package
would retroactively rewrite an already-paid-out month. Hence periods and
snapshots.

### Data

- **`TrainerRate`** — `trainerUserId`, `percent`, `effectiveFrom`,
  `effectiveTo?`. History-tracked so raising a rate in March does not silently
  change February. Admin-managed.
- **`PayrollPeriod`** — one row per trainer per calendar month (Belgrade),
  status `OPEN → LOCKED`. Open recomputes live from bookings. Locking snapshots
  every line.
- **`PayrollLine`** — the snapshot: session, attendee, package name, per-session
  value, percent, amount, and whether the line was a gift. Written on lock.
- **`PayrollAdjustment`** — manual +/- amount with a note, for corrections and
  bonuses.

### Month boundary

Calendar month in Belgrade time, owner-confirmed. `lib/studio-time.ts` is the
project's only timezone infrastructure and already exposes
`STUDIO_TIMEZONE`/`startOfStudioDay`; month boundaries build on it. Note the
studio day starts at 05:00, so a month runs from 05:00 on the 1st to 05:00 on
the 1st of the next month — consistent with how packages already expire.

### Locking

Admin-only, and **reversible** with a recorded reason. Month one will need
corrections while prices settle; a one-way lock would force data surgery.

### Surfaces

- **Admin** — month picker → per-trainer totals → drill into sessions →
  attendees with package name and value. CSV export. A warning banner when any
  line could not be valued (a package type with no price).
- **Trainer** — own month only: sessions held, attendee count, earnings. Open
  months labelled preliminary.

### Authorization

PR #123 removed `TRAINER` from studio-wide report routes because they leaked
owner-level financials and other trainers' figures. That precedent binds here:
the trainer endpoint returns **only the requesting trainer's own** period,
derived from the session user, never from a client-supplied `trainerUserId`.
Trainers must not reach another trainer's earnings or any studio-wide total.
Integration tests must assert this cross-tenant denial explicitly.

Trainers seeing client package names is acceptable — owner-confirmed.

## Risks

- **Unpriced package type silently contributes 0.** The period surfaces a
  warning listing affected lines rather than quietly computing a low total.
- **Gift cost is invisible in revenue.** Gift and make-up sessions pay the
  trainer with no matching income. The breakdown separates gift lines so the
  owner sees the absorbed cost.
- **`sessionsTotal` regression risk.** The gift count override touches the same
  computation #133 fixed to stop "13/12" rendering. It is computed at three
  sites, all in `server/routes/packages/client-packages.ts` (lines 68, 232, 303)
  and all reading `packageType.sessionCount + bonusSessions` — so a 1-session
  gift on a 12-session SKU renders "1/12" at every one of them until the granted
  count is stored on the package rather than derived from the SKU.

## Out of scope

Per-class-type percentages, automated payouts or bank integration, trainer
self-service rate negotiation, historical recomputation of months before the
module ships.

## Open questions

None blocking. Decisions recorded above: gift session count defaults to 1;
existing gifts remapped to `Reformer 12`; one flat percent per trainer; charged
no-shows count; calendar month in Belgrade.
