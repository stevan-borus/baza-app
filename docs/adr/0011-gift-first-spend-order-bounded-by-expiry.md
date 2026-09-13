# 0011 — Gift packages are spent first, bounded by soonest expiry

## Status
Accepted — 2026-09-13. Revises the spend priority set by ADR-0010.

## Context

A birthday gift is its own ClientPackage row with `isGift: true` (ADR-0007 chose
reusing the Poklon paket flow over a bespoke entity; that decision stands). It
therefore sits in the same eligible-candidate pool as everything else the client
owns, and `findEligibleClientPackage` ordered that pool by narrowest ClassType
set, then soonest expiry (ADR-0010).

Under that order a gift gets stranded. A client who receives a 30-day gift while
holding a fresh 10-session pack spends the paid pack first — the gift's expiry is
usually further out than a pack bought weeks earlier — and the gift lapses
unused. The studio gave something away and the client never felt it, which is the
entire point of the gesture.

The obvious fix, unconditional gift-first, destroys value in the opposite
direction. A client holding a paid pack expiring in 3 days plus a gift expiring in
30 would spend the gift and forfeit credits they paid for. A front-desk human
would never do that.

## Decision

Gift-first is a **preference, bounded by soonest expiry**. Within the eligible
candidates, `findEligibleClientPackage` now orders by:

1. **Narrowest ClassType set** (unchanged, ADR-0010) — a single-type pack before a
   mix pack, so the mix pack's flexibility survives.
2. **Soonest `expiresAt`** (unchanged) — the dying pack is burned first, gift or
   not.
3. **Gift before paid** — new, and only ever reached as a tie-break at step 2.
4. **`id`** — new, so two otherwise-equal candidates resolve identically on every
   fetch instead of following whatever order the rows arrived in.

Because the gift rule sits *below* expiry, it can never move a spend past a
credit that dies sooner. The four cases that pin the behaviour:

| Gift expires | Paid expires | Spent |
|---|---|---|
| 2026-10-01 | 2026-12-01 | **gift** — nothing expires sooner |
| 2026-12-01 | 2026-10-01 | **paid** — never burn past a sooner expiry |
| same day | same day | **gift** |
| any (mix set) | any (single-type set) | **paid** — width still outranks the preference |

Eligibility filtering is untouched: a revoked, used-up, unstarted, expired or
paused gift is still not a candidate at all.

`isGift` joins `revokedAt` as a **required** field on `EligibilityPackage` and
`ELIGIBILITY_PACKAGE_SELECT`, so a future query cannot silently drop it and
quietly revert to the stranding behaviour this ADR exists to fix.

## Consequences

- Gifts get used, which is what makes them worth granting. The studio's gesture
  lands while the client remembers receiving it.
- Paid credits are never forfeited to a gift. The expiry bound is the load-bearing
  half of this decision — remove it and the feature becomes a way to lose the
  client money.
- A gift carries the SKU's price, so `SessionConsumption.sessionValue` still
  values the session and the trainer's payout is unaffected by which package
  backed the booking.
- Consumption order changes which ClientPackage a booking attributes to. Reports
  that separate comps from revenue will now show gift sessions consumed earlier
  in a client's timeline, and a paid pack's burn-down shifts later. No report
  logic changes, but the shape of historical-vs-future data differs at the
  cutover.
- Ordering is now fully deterministic through the `id` fall-through. Previously
  two equal candidates could swap between fetches depending on row order.

**Alternatives rejected:**

- **Unconditional gift-first**: forfeits paid credits whenever the gift outlives a
  dying pack. Rejected on the value-destruction case above.
- **Gift-first only when the gift expires within N days**: a threshold nobody can
  defend, and the expiry bound already expresses the real rule without a magic
  number.
- **Merging the gift's session into the paid pack as a top-up**: contradicts
  ADR-0007 and loses the gift's own validity window and comp reporting.

## Related
- ADR-0010 — whose spend priority ("narrowest set, tie-broken by soonest expiry")
  this ADR extends with steps 3 and 4.
- ADR-0007 — the gift is a ClientPackage, which is why it lands in this pool.
- `apps/mobile/lib/server/package-eligibility.ts` → `findEligibleClientPackage`.
- CONTEXT.md → "Example dialogue" (which ClientPackage gets decremented).
