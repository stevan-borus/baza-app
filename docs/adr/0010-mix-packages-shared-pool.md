# Mix packages are one shared session pool, spent narrowest-scope-first

A PackageType can now cover a **set** of ClassTypes (a "mix package": e.g. Reformer + Energy). We decided the package's sessions are **one shared pool** — any of the `sessionCount` sessions can be spent on any covered ClassType, in any ratio — rather than per-ClassType quotas ("8 Reformer + 4 Energy"). The studio's ask was pool-shaped ("pick whatever they want for those 12 sessions"), and quotas would fracture `sessionsRemaining` into a per-type map that ripples through billing, consumption, late-cancel forfeits, and every "X remaining" surface.

When several ClientPackages are eligible for a booking, the **narrowest ClassType set wins** (a Reformer-only pack is spent before a Reformer+Energy mix pack), tie-broken by **soonest effective expiry**. Spending the mix pack while a narrow pack could cover the session would silently burn the client's flexibility — the rule is what a front-desk human would do. This supersedes both the old glossary claim ("oldest by `startsAt`") and the old code behavior (newest by `startsAt`), which contradicted each other anyway.

## Consequences

- Storage is two explicit join tables (`PackageTypeClassType`, `ClientPackageClassType`) with `onDelete: Restrict` from ClassType, keeping the schema's Restrict-everywhere delete safety; the scalar `classTypeId` columns are dropped after backfill.
- A ClientPackage snapshots the **set** at activation, so SKU edits (including changing the set) never retroactively change owned packages.
- Per-ClassType quotas within one package are deliberately out of scope; if the studio ever asks for them, that's a new product, not a flag on this one.
