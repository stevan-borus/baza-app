# 8. Admin reservations skip the package-eligibility gate, and admins can waive the late-cancel charge

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

There is a second, related operational problem on the **cancel** side. A Client who genuinely can't attend (sick, emergency) often tells the studio out-of-band — a text or a call — only minutes before the Session, well inside the late-cancel cutoff. The forfeit logic can't tell that apart from a careless no-show, so it charges a session either way. Forcing the forfeit in the legitimate case punishes a Client for the studio's own informal communication channel. The studio wants to be able to forgive it — deliberately, and without making "free passes" the default.

## Decision

### Admin reservations skip the eligibility gate

Admin reservations are stored as regular `Booking` rows created via an admin-only path that **skips** the package-eligibility check. `clientPackageId` may be `null` at creation. The cron at session-end re-runs the same `findEligibleClientPackage` resolver it already uses today; if it finds a covering package, it decrements; if not, it records `NO_PACKAGE` and notifies all admins (push + in-app).

Clients see admin reservations identically to self-booked Bookings — same calendar entry, same cancel rights, same waitlist mechanics. The only data-level differences are the nullable `clientPackageId` and an audit pointer to the creating Admin.

### Admins can waive the late-cancel charge

When an admin cancels a Client's Booking, they may apply a **charge waiver** — a per-cancel "don't charge this session" toggle, **defaulting OFF** — on both admin cancel surfaces: the bulk reservation-cancel confirm sheet, and a long-press "excuse & remove" action on the admin session-detail roster. When the toggle is on, the cancel **skips the forfeit entirely** (no `SessionConsumption` row, no `sessionsRemaining` decrement — *not* a charge-then-refund) and stamps the Booking with `waivedByUserId` (the acting admin; the "when" is the existing `canceledAt`).

The waiver only has teeth on a **late, package-backed** Booking. An early cancel and an unbacked admin reservation are already consequence-free, so the toggle is a no-op there. A waiver never touches a **no-show**: a Booking left uncancelled is still charged by `cron:sessions` at session-end (the cron scans only `canceledAt IS NULL` Bookings).

Why these specifics:
- *Toggle, default OFF* rather than "admins never charge": the default keeps the forfeit uniform (an unexcused late cancel, like a no-show, still costs a session), so the waiver stays a deliberate, exceptional act — not the new normal.
- *Skip, not refund*: the cancel happens before session-end, so the session was never consumed; writing a consumption only to reverse it adds noise. Because the cron charges only **uncancelled** Bookings, a waived-and-cancelled Booking is never re-charged at session-end — no double-charge risk.
- *Single `waivedByUserId` column*: mirrors the existing `createdByUserId` audit pattern on `Booking`; makes studio generosity visible and lets us spot habitual over-use.

## Consequences

**Positive:**
- Reuses `Booking`, `Session`, `WaitlistEntry`, capacity checks, late-cancel cron, trainer-visibility, calendar rendering — no new entity, no new joins, no new invariants. The waiver adds one nullable column on the same row.
- Aligns with how the studio actually operates: payment arrangements with long-term clients sit outside the per-package transaction; the schedule is the source of truth for *who is coming*, the package ledger is the source of truth for *who has paid*. These were already separable; we're just making the gap usable. The waiver extends the same instinct to the cancel side — and keeps the gap **visible** via `waivedByUserId`.
- The cron already classifies attendance as `CONSUMED | NO_PACKAGE | alreadyConsumed | failed`. We promote `NO_PACKAGE` from a silent counter to an admin-facing notification, surfacing unpaid attendance without blocking it.

**Negative / accepted tradeoffs:**
- Admins carry the full risk of a non-paying client. If the admin reserves 6 months and the client never pays, the admin must remember to cancel the future reservations. The unbacked-attendance notification is the mitigation — it fires at each completed session, so the admin sees the problem accumulating in real time.
- Reports that count "sessions delivered" vs. "sessions paid" diverge for any unbacked attendance. This is the *correct* accounting truth (the studio gave a free session) and the divergence is exactly what makes the situation visible.
- The waiver gives up the guarantee that *every* late forfeit is uniform, in exchange for the operational reality that some late cancels are legitimate and arranged out-of-band. The `waivedByUserId` audit is the mitigation — waivers are attributable, so abuse is detectable rather than invisible.
- Two booking paths now exist with different policies (`POST /bookings` for clients, an admin path that skips the gate). The contract divergence has to stay narrow — only the eligibility check differs; everything else (capacity, idempotency, waitlist fallback, response shape) must remain identical.

**Explicitly out of scope of this ADR:**
- Whether the admin path lives at `POST /admin/bookings`, `POST /bookings` with an `actor` flag, or somewhere else (routing decision, not architectural).
- Bulk reservation UX (selecting many sessions at once across weeks) — a UI problem on top of the booking primitive.
- Recurring reservations (a series concept for admin reservations themselves). Deferred until we see how often admins actually want it vs. just clicking through a week.
- A client-facing or report-facing surface for waivers beyond the `waivedByUserId` audit column. We store the fact now; how (and whether) to report on it is deferred until there's a real need.
