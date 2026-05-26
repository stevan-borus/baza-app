# 8. Admin reservations skip the package-eligibility gate

Date: 2026-05-26

## Status

Accepted

## Context

Admins need to lock in long-term clients on the schedule so their habitual seats don't get filled by other clients. The mix of sessions can vary week to week (one week Mon/Wed/Fri 7am, the next Tue/Thu 5pm), and reservations may extend months — even a year — into the future.

The existing `POST /bookings` path enforces an eligible **ClientPackage** at booking time (`no_package_for_class`, 409): the package must be scoped to the Session's ClassType, active, not paused, not expired at the Session's `startsAt`, with `sessionsRemaining > 0`. This protects clients from booking sessions they can't actually pay for.

That gate makes long-horizon admin reservations impossible. A client's 30-day package can't cover a Session three months out, so the booking would be rejected — even though the studio knows about an out-of-band payment arrangement with that client.

Three coherent options were considered:

1. **Admin pre-sells / comps packages to cover the horizon, then books normally.** Honest, but defeats the point — the long-term-client workflow becomes admin bookkeeping gymnastics.
2. **Admin booking is unbacked (`clientPackageId = null`); cron late-binds at session-end.** Reuses the existing `Booking` model and the cron's existing late-binding logic (`cron/sessions/consumption/+api.ts` already re-resolves the eligible package at session-end, not at booking-time).
3. **A new "phantom" ClientPackage type that doesn't decrement or expire.** Pollutes expiry crons, reports, "sessions remaining" displays, and breaks the package-class scoping invariant.

## Decision

Admin reservations are stored as regular `Booking` rows created via an admin-only path that **skips** the package-eligibility check. `clientPackageId` may be `null` at creation. The cron at session-end re-runs the same `findEligibleClientPackage` resolver it already uses today; if it finds a covering package, it decrements; if not, it records `NO_PACKAGE` and notifies all admins (push + in-app).

Clients see admin reservations identically to self-booked Bookings — same calendar entry, same cancel rights, same waitlist mechanics. The only data-level differences are the nullable `clientPackageId` and an audit pointer to the creating Admin.

## Consequences

**Positive:**
- Reuses `Booking`, `Session`, `WaitlistEntry`, capacity checks, late-cancel cron, trainer-visibility, calendar rendering — no new entity, no new joins, no new invariants.
- Aligns with how the studio actually operates: payment arrangements with long-term clients sit outside the per-package transaction; the schedule is the source of truth for *who is coming*, the package ledger is the source of truth for *who has paid*. These were already separable; we're just making the gap usable.
- The cron already classifies attendance as `CONSUMED | NO_PACKAGE | alreadyConsumed | failed`. We promote `NO_PACKAGE` from a silent counter to an admin-facing notification, surfacing unpaid attendance without blocking it.

**Negative / accepted tradeoffs:**
- Admins carry the full risk of a non-paying client. If the admin reserves 6 months and the client never pays, the admin must remember to cancel the future reservations. The unbacked-attendance notification is the mitigation — it fires at each completed session, so the admin sees the problem accumulating in real time.
- Reports that count "sessions delivered" vs. "sessions paid" diverge for any unbacked attendance. This is the *correct* accounting truth (the studio gave a free session) and the divergence is exactly what makes the situation visible.
- Two booking paths now exist with different policies (`POST /bookings` for clients, an admin path that skips the gate). The contract divergence has to stay narrow — only the eligibility check differs; everything else (capacity, idempotency, waitlist fallback, response shape) must remain identical.

**Explicitly out of scope of this ADR:**
- Whether the admin path lives at `POST /admin/bookings`, `POST /bookings` with an `actor` flag, or somewhere else (routing decision, not architectural).
- Bulk reservation UX (selecting many sessions at once across weeks) — a UI problem on top of the booking primitive.
- Recurring reservations (a series concept for admin reservations themselves). Deferred until we see how often admins actually want it vs. just clicking through a week.
