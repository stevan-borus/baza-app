# 0007 — Birthday gift reuses Poklon paket flow via PackageType.isBirthdayGift

## Status
Accepted — 2026-05-14.

## Context

The "birthday gift" feature lets admins grant a free 30-day session to clients on their birthday. Two designs were on the table:

1. **Bespoke `BirthdayGift` entity** with its own schema, endpoint, reports, etc.
2. **Reuse the existing Poklon paket (complimentary ClientPackage) flow**, with a `PackageType.isBirthdayGift` boolean to flag specific types as the studio's birthday gift offering.

We chose (2).

## Decision

`PackageType` gains a nullable-defaulting `isBirthdayGift Boolean @default(false)`. Admins create a Birthday Gift PackageType once per ClassType they want to gift (e.g., "Reformer — Rođendanski poklon"). Server-side Zod enforces `sessionCount = 1` when the flag is on; `validityDays` is admin-configurable.

The Birthday Gift flows through the existing Poklon paket creation path. Reports, inventory, eligibility, and consumption logic are unchanged. The cron pings admins; the existing Poklon paket UI grants the gift; a `BIRTHDAY_CLIENT_GIFT` notification fires on grant.

## Consequences

**Positive:**
- Zero new entities. One boolean + two enum values across the entire feature.
- The Birthday Gift is structurally identical to a Poklon paket — reports show comp packages uniformly, no per-feature special-case.
- Eligibility resolver (oldest-by-startsAt) already handles "client has multiple active packages" — the gift extends their reach past a regular pack's expiry naturally, which is exactly the user-impact we wanted for clients whose regular pack is ending soon.

**Negative:**
- The catalog UI mixes regular and gift PackageTypes in the same list (with a badge to distinguish them). Admins may find this slightly confusing at first.
- If we ever want to track "did Ana get her 2026 birthday gift?" as a structured query, we'd need to add a `grantReason` or similar — not blocking today, but a future migration if reporting needs grow.

**Alternatives rejected:**
- Bespoke `BirthdayGift` entity: too much for a feature whose 80% solution is "remind admin, admin uses existing comp flow." Tail wagging dog.
- One-off `sessionCount=1, validityDays=30` ClientPackage without a PackageType reference: would have required making `ClientPackage.packageTypeId` nullable, which the eligibility/reporting code does not currently expect. Higher blast radius for marginal benefit.

## Related
- CONTEXT.md → `Birthday Gift`, `cron:birthdays`, `Suggested ClassType (birthday gift)`.
- PR 3 in the birthday/cancellation initiative.
