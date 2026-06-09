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
   know the outcome — because an optimistic `onMutate` already wrote the correct
   value, or the response carries the full created/updated entity, or the
   endpoint can cheaply be made to return that entity. Same principle as the
   merged notification-toggle fix (PR #50): when the mutation knows what changed,
   write the cache; don't round-trip. Where a plain-list endpoint returns only a
   partial today, we widen its server response so the splice has the full row.
   **Paginated/infinite-list targets are deliberately excluded** — splicing across
   pages is fragile, so those keep invalidating.

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

### Part 2b — splice cache from result (Cat B)

Replace `invalidateQueries` with `setQueryData` for mutations that target a
**plain (non-infinite) list or detail** query and whose response carries the
complete row — either already, or after a small server-side widening (2b-server).

**Already-complete responses (no server change):**

| Factory | Mutation | Target | Server returns |
|---|---|---|---|
| campaigns | create | `list()` + `one(id)` | `{ campaign }` full CAMPAIGN_SELECT |
| campaigns | update | `list()` + `one(id)` | `{ campaign }` full |
| campaigns | cancel | `list()` + `one(id)` | `{ campaign }` full |
| campaigns | send | `list()` + `one(id)` | `{ campaign }` full |
| campaigns | remove | `list()` | `{ success }` — delete needs only id (already have it) |
| rooms | create | `list()` | `{ room }` (id,name,capacity) |
| rooms | update | `list()` | `{ room }` full |
| trainings | createClassType | `classTypes()` | `{ classType }` full |
| trainings | updateClassType | `classTypes()` | `{ classType }` full |
| packages | createType | `types()` | `{ packageType }` full select |

### Part 2b-server — widen server response, then splice (6 plain-list endpoints)

These target **plain (non-infinite) lists** but the route handler currently
returns a partial/`{success}` response. Widen the Prisma `select` (or return the
updated row) so the response is list-row-complete, then splice client-side:

| Factory | Mutation | Endpoint | Add to response |
|---|---|---|---|
| sessions | create | `sessions/+api.ts` POST | `classTypeId`, `classType{id,name}`, `roomId`, `room{id,name}` |
| sessions | update | `sessions/[id]/+api.ts` PATCH | `classTypeId`, `classType{}`, `room{}` |
| invites | create | `invites/+api.ts` POST | `firstName`, `lastName`, `phone` |
| invites | revoke | `invites/[id]/revoke/+api.ts` | return updated invite row (was `{success}`) |
| invites | resend | `invites/[id]/resend/+api.ts` | return updated invite row (was `{success}`) |
| packages | updateType | `packages/types/[id]/+api.ts` PATCH | `isBirthdayGift` |

Sessions `byId` **detail** stays a fetch — its nested bookings/waitlist/trainer
are too heavy to splice from a mutation; only the **list** row is spliced.

**Total splices: 16** (10 already-complete incl. campaigns.remove + 6 from the
server-widened endpoints). Each splice: append for create, map-replace-by-id for
update, filter-by-id for delete; plus the matching detail-key `setQueryData` for
campaigns' four.

### Part 2c — keep invalidating (documented, NOT changed) — **pagination excluded by request**

Per the decision to exclude paginated targets, every **infinite/paginated** query
stays on `invalidateQueries`. Splicing across `getNextPageParam` pages is fragile,
and several also need server-computed fields a mutation can't cheaply produce:

- `clients.create` / `clients.update` — infinite `clients.list`, and the row's
  `packageStatus` is computed from the package tree (POST/PATCH can't return it
  cheaply).
- `billing.create` — infinite `billing.listInfinite`.
- `trainer-notes.create` / `trainer-notes.update` — infinite `listInfinite`.
- `packages.createClientPackage` — feeds the infinite `clientPackagesAdminList`
  (the plain `clientPackages()` splice is fine and stays in 2a's original set).

Also unchanged (genuinely need a refetch): **bulk / derived-aggregate** —
`reservations.*`, `bookings.mutateBooking`, `packages.pause`, recurring-session
mutations, and destructive deletes that ripple into availability counts.

Building infinite-page splice helpers for the excluded set is out of scope.

## Risks & containment

- **Narrowing a broad invalidation** → every bare domain literal maps to that
  domain's `all` (identical prefix), never a sub-method key. Reviewable
  prefix-for-prefix.
- **Splice writing a partial/stale row** → contained by splicing only plain-list
  targets whose response is (or is made) list-row-complete; every infinite/
  paginated target and every uncertain response stays invalidating.
- **Widened server select drifts from the row schema** → each widened endpoint
  parses its response through the row's zod schema before returning, and an
  integration test (real test DB) asserts the new fields are present.
- **Key-shape typos in the spread rewrite** → caught by `tsc --noEmit`
  (`as const` tuples are structurally typed; every `useQuery` consumer
  type-errors on a shape change).
- **Cross-factory import cycles** (consent → clients/auth `all`) → factories are
  leaf modules; importing a sibling's `all` const is acyclic. Verified by tsc.

## Verification

1. `pnpm exec tsc --noEmit` → 0 errors.
2. `pnpm test:unit` → full suite green (273 baseline; `clients-queries-factory.test.ts`
   guards key shapes). New unit test per splice (16) plus the Cat A optimistic-write
   tests: assert the cache list/detail holds the spliced entity after the mutation
   and that the target query is **not** invalidated (spy on `invalidateQueries`),
   mirroring the PR #50 no-refetch test.
3. `pnpm test:integration` → for each of the 6 widened endpoints (sessions
   create/update, invites create/revoke/resend, packages updateType), an integration
   test against the real `baza_app_test` DB asserts the response now contains the
   added fields. (Requires the seeded test DB; `pnpm test:e2e:prepare` if needed.)
4. `pnpm exec oxlint` on changed files → 0 warnings.
5. Grep gate: `grep -rn 'queryKey: \["' app/ components/` → zero domain-literal
   invalidations.
6. Per-domain diff: each broad call site's `all` equals the prefix it replaced.

## Commit / PR shape

One branch `refactor/query-key-factories` off `dev`, independent of PR #50.
Logical commits:
1. `all` + spread across all factories (no behavior change; suite stays green).
2. Swap consumer + in-factory broad literals to derived keys.
3. Cat A: drop redundant invalidations / add optimistic writes (+ unit tests).
4. Server: widen the 6 plain-list endpoint responses (+ integration tests).
5. Cat B: 16 verified splices (+ unit tests).
