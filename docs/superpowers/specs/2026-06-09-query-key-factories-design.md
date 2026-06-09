# Query-key factories + cache-update sweep — design

**Date:** 2026-06-09
**Branch:** `refactor/query-key-factories`
**Status:** Design — awaiting approval

## Problem

Two related React Query hygiene issues across the app:

1. **Hand-rolled query keys.** ~29 call sites hand-write key array literals
   (`invalidateQueries({ queryKey: ["clients"] })`, `["packages", "types"]`)
   instead of deriving from the query-options factory that owns the key. These
   duplicate the canonical key and silently drift if a factory's shape changes —
   a no-longer-matching invalidation fails open (stale UI) with no compile signal.

2. **Refetch where a local cache update would do.** Several mutations
   `invalidateQueries` (triggering a network refetch) even though they already
   know the outcome — either because an optimistic `onMutate` already wrote the
   correct value, or because the mutation response carries the full
   created/updated entity. Same principle as the merged notification-toggle fix
   (PR #50): when the mutation knows what changed, write the cache; don't round-trip.

## Part 1 — the `all` root-key convention

Each factory gains an `all` member (the bare domain prefix as a typed const), and
every sub-query key spreads it. Because an object literal cannot reference its own
property during initialization, each factory declares a module-private
`<domain>All` const that both `all` and the sub-keys reference:

```ts
const clientsAll = ["clients"] as const;

export const clientsQueries = {
  all: clientsAll,
  list: (params) =>
    queryOptions({ queryKey: [...clientsAll, "list", params] as const, /* … */ }),
  byId: (id) =>
    queryOptions({ queryKey: [...clientsAll, "byId", id] as const, /* … */ }),
};
```

Consumers derive:
- **Broad (domain-wide) invalidation:** `qc.invalidateQueries({ queryKey: clientsQueries.all })`
- **Exact invalidation:** `qc.invalidateQueries({ queryKey: packagesQueries.types().queryKey })`

This is the TanStack-recommended pattern. Prefix lives once; sub-keys can't drift;
broad-vs-exact is a deliberate, readable choice at the call site.

**Scope:** add `all` + spread to **all ~19 factories** (auth, billing, bookings,
campaigns, client-packages-timeline, clients, consent, health-intake, invites,
legal, notifications, packages, reports, reservations, rooms, sessions,
trainer-notes, trainings, users) — even ones never broadly invalidated, for a
consistent end state. Swap **all ~29 consumer literals** (in `app/`, `components/`,
and the broad literals living inside factories) to derived `all` / `.queryKey`.

**Pure refactor:** every broad literal maps to that domain's `all` (same prefix,
same match set); every exact literal maps to the same full key. Invalidation
semantics are identical before/after.

## Part 2 — cache updates over refetch

Scope here is deliberately **only what is verified safe** against the actual API
route handlers (read during design). Two buckets change; a third is documented as
intentionally left alone.

### Part 2a — drop redundant invalidations (Cat A, 3 sites)

These already have, or should trivially have, an optimistic write that makes the
post-settle refetch redundant:

1. **`useRecordSocialMediaMutation`** (`consent-queries-factory.ts`): has
   `onMutate` optimistic write + `onError` rollback, then `onSettled` invalidates
   the same `statusKey`. Drop the `onSettled` — the optimistic value *is* the
   server-confirmed value once the POST resolves.
2. **`useUpdatePreferencesMutation`** (`notifications-queries-factory.ts`):
   currently `onSuccess` invalidates `["notifications","preferences"]` with no
   `onMutate`. Replace with `onMutate` optimistic cache write + `onError` rollback,
   no invalidation. (This is the PR #50 fix; this branch is off `dev` and predates
   it, so it's reapplied here under the new key convention.)
3. The two component wrappers of `useUpdatePreferencesMutation`
   (`notifications-preferences-sheet.tsx`, `profile-sheet.tsx`) inherit the fix —
   verify they don't add their own duplicate invalidation; remove if present.

### Part 2b — splice cache from result (Cat B, 11 verified-safe sites)

For these, the route handler returns the **complete entity** the target query's
row needs, AND the target is a **plain (non-infinite) list or a detail query**.
Replace the `onSuccess` `invalidateQueries` with `setQueryData` that
inserts/updates the entity in the list (and detail where applicable):

| Factory | Mutation | Target | Server returns |
|---|---|---|---|
| campaigns | create | `list()` + `one(id)` | `{ campaign }` full CAMPAIGN_SELECT |
| campaigns | update | `list()` + `one(id)` | `{ campaign }` full |
| campaigns | cancel | `list()` + `one(id)` | `{ campaign }` full |
| campaigns | send | `list()` + `one(id)` | `{ campaign }` full |
| rooms | create | `list()` | `{ room }` (id,name,capacity) |
| rooms | update | `list()` | `{ room }` full |
| trainings | createClassType | `classTypes()` | `{ classType }` full |
| trainings | updateClassType | `classTypes()` | `{ classType }` full |
| packages | createType | `types()` | `{ packageType }` full select |

(9 rows = 11 mutations counting campaigns' four.) Each splice is a small,
list-shape-specific update: append for create, map-replace by id for update,
plus `setQueryData` on the matching detail key for campaigns.

### Part 2c — keep invalidating (documented, NOT changed)

The remaining mutations the audit flagged stay as `invalidateQueries` — splicing
them would corrupt the cache. Recorded so the next reader knows it was a decision,
not an oversight:

- **Infinite/paginated targets** — `clients.list`, `trainer-notes.listInfinite`,
  `billing.listInfinite`, `packages.clientPackagesAdminList`: splicing across
  `getNextPageParam` pages is fragile; invalidation is correct.
- **Partial/untyped responses** — `sessions.create/update` (response omits
  `classTypeId`/`roomId`/`trainerUserId` the list row needs), `invites.create`
  (omits firstName/lastName/phone), `invites.revoke/resend` (`{success}` only),
  `clients.create` (returns `user`, not the clientProfile list shape),
  `clients.update` / `packages.updateType` (untyped `response.json()`),
  `campaigns.remove` (`{success}` only).
- **Bulk / derived-aggregate** — `reservations.*`, `bookings.mutateBooking`,
  `packages.pause`, recurring-session mutations, deletes: affect availability
  counts and multiple derived lists; invalidation is the safe choice.

Widening server selects or building infinite-page splice helpers to convert these
is explicitly **out of scope** for this PR (a separate effort if ever wanted).

## Risks & containment

- **Narrowing a broad invalidation** → every bare domain literal maps to that
  domain's `all` (identical prefix), never a sub-method key. Reviewable
  prefix-for-prefix.
- **Splice writing a partial/stale row** → contained by only splicing the 11
  verified-complete + plain-list cases; everything uncertain stays invalidating.
- **Key-shape typos in the spread rewrite** → caught by `tsc --noEmit`
  (`as const` tuples are structurally typed; every `useQuery` consumer
  type-errors on a shape change).
- **Cross-factory import cycles** (consent → clients/auth `all`) → factories are
  leaf modules; importing a sibling's `all` const is acyclic. Verified by tsc.

## Verification

1. `pnpm exec tsc --noEmit` → 0 errors.
2. `pnpm test:unit` → full suite green (273 baseline; `clients-queries-factory.test.ts`
   guards key shapes). New unit tests for each of the 11 splices: assert the cache
   list/detail holds the spliced entity after the mutation and that the target
   query is **not** invalidated (spy on `invalidateQueries`), mirroring the PR #50
   no-refetch test.
3. `pnpm exec oxlint` on changed files → 0 warnings.
4. Grep gate: `grep -rn 'queryKey: \["' app/ components/` → zero domain-literal
   invalidations.
5. Per-domain diff: each broad call site's `all` equals the prefix it replaced.

## Commit / PR shape

One branch `refactor/query-key-factories` off `dev`, independent of PR #50.
Logical commits:
1. `all` + spread across all factories (no behavior change; suite stays green).
2. Swap consumer + in-factory broad literals to derived keys.
3. Cat A: drop redundant invalidations / add optimistic writes (+ tests).
4. Cat B: 11 verified splices (+ tests).
