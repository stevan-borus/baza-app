# Query-key factory sweep — design

**Date:** 2026-06-09
**Branch:** `refactor/query-key-factories`
**Status:** Design — awaiting approval

## Problem

React Query call sites across the app hand-roll query-key array literals
(`invalidateQueries({ queryKey: ["clients"] })`, `["packages", "types"]`, …)
instead of deriving them from the query-options factories that own those keys.
Audit found ~29 such literals across ~14 consumer files plus a few inside the
factories themselves. These duplicate the canonical key and silently drift if a
factory's key shape ever changes — an invalidation that no longer matches its
target fails open (stale UI) with no compile-time signal.

Two distinct shapes hide in those 29 literals:

1. **Exact duplicates** — the literal equals a factory's full `.queryKey`, e.g.
   `["packages", "types"]` == `packagesQueries.types().queryKey`. ~10 sites.
2. **Broad-prefix invalidations** — a bare domain root like `["clients"]` that
   relies on TanStack's prefix matching to invalidate *every* query in the
   domain (list + byId + health + consent-records). No single factory method's
   key expresses this; it's the domain prefix itself. ~19 sites.

A naive "replace each literal with the nearest factory key" would be wrong: it
would narrow the broad invalidations and reintroduce stale-data bugs. So the fix
has to give the broad case a first-class home too.

## Approach: the `all` root-key convention

Each factory gains an `all` member — the bare domain prefix as a typed const —
and every sub-query key is rewritten to **spread `all` as its prefix**:

```ts
const clientsAll = ["clients"] as const;

export const clientsQueries = {
  all: clientsAll,
  list: (params) =>
    queryOptions({
      queryKey: [...clientsAll, "list", params] as const,
      // …
    }),
  byId: (id) =>
    queryOptions({
      queryKey: [...clientsAll, "byId", id] as const,
      // …
    }),
};
```

Note the `clientsAll` standalone const: an object literal cannot reference its
own property (`clientsQueries.all`) during its own initialization, so each
factory declares a module-private `<domain>All` const and both `all` and the
sub-keys reference that. This keeps the prefix defined exactly once per domain.

Consumers then derive:

- **Broad invalidation:** `qc.invalidateQueries({ queryKey: clientsQueries.all })`
- **Exact invalidation:** `qc.invalidateQueries({ queryKey: packagesQueries.types().queryKey })`

This is the TanStack-recommended query-key-factory pattern. The prefix lives in
one place; sub-keys can't drift from it; broad vs. exact invalidation is now a
deliberate, readable choice at the call site.

## Scope (full sweep — approved)

**Factories (all ~19 in `lib/queries/`):** add `all` and spread it into every
sub-key, even factories never broadly invalidated, for a consistent end state.
Factories: auth, billing, bookings, campaigns, client-packages-timeline,
clients, consent, health-intake, invites, legal, notifications, packages,
reports, reservations, rooms, sessions, trainer-notes, trainings, users.

**Consumer call sites (~14 files in `app/` + `components/`):** replace every
hand-rolled domain literal in `invalidateQueries` / `setQueryData` /
`getQueryData` / `cancelQueries` / `removeQueries` / `refetchQueries` with the
derived `all` (broad) or `.queryKey` (exact).

**In-factory literals:** the broad invalidations already living inside factories
(`consent`, `health-intake`, `campaigns`, `reservations`) switch to the derived
`all` of the relevant domain — importing the sibling factory where needed (e.g.
consent's mutation invalidating `clientsQueries.all` and `authQueries.all`).

### Out of scope

- No behavior change to *which* queries get invalidated. Each broad literal maps
  to that domain's `all` (same prefix, same match set); each exact literal maps
  to the same full key. This is a pure refactor — the cache-invalidation
  semantics are identical before and after.
- `reports-queries-factory.ts` has 15 multi-line keys but no broad invalidation
  against it; it still gets an `all` + spread for consistency.
- The `["bookings"]` literal in `reservations-queries-factory` (lines 71/84):
  `bookingsQueries` exists — its `all` becomes `["bookings"]`. Verify the bare
  `["bookings"]` prefix actually matches `bookingsQueries`' key shape; if the
  factory's only key is longer, `bookingsQueries.all` is still the correct
  prefix to invalidate.

## Risks & how the design contains them

- **Narrowing a broad invalidation by mistake** → caught by mapping every bare
  domain literal to that domain's `all` (identical prefix), never to a
  sub-method key. A reviewer can diff prefix-for-prefix.
- **Key-shape typos during the spread rewrite** → caught by `tsc --noEmit`: the
  `as const` tuples are structurally typed, and every `queryOptions` consumer
  (the `useQuery` call sites) would type-error if a key's shape changed.
- **Cross-factory imports introducing cycles** (e.g. consent → clients/auth) →
  factories are leaf modules (only import `apiFetch`, `sharedEnv`, zod, types);
  importing one factory's `all` const from another is acyclic. Verify with tsc.

## Verification

1. `pnpm exec tsc --noEmit` → 0 errors (proves key shapes still align with every
   `useQuery`/`useInfiniteQuery` consumer).
2. `pnpm test:unit` → full suite green (273 baseline; existing
   `clients-queries-factory.test.ts` asserts key shapes and is a guard).
3. `pnpm exec oxlint` on changed files → 0 warnings.
4. Grep gate: `grep -rn 'queryKey: \["' app/ components/` returns **zero**
   domain-literal invalidations (only factory files legitimately contain string
   literals, and there only inside the `<domain>All` const).
5. Per-domain diff check: for each broad call site, confirm `<domain>.all`
   equals the prefix of the literal it replaced.

## Commit / PR shape

One branch `refactor/query-key-factories` off `dev`. Logical commits:
1. Add `all` + spread to all factories (no consumer changes yet — suite still
   green because keys are unchanged in value).
2. Swap consumer call sites to derived keys.
3. Swap in-factory broad literals to derived `all`.

PR targets `dev`, independent of the toggle-fix PR (#50).
