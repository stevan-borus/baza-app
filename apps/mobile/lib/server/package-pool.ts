/**
 * Pool-aware booking math, DB-free so it can be unit-tested in isolation.
 *
 * `findEligibleClientPackage` picks ONE package to spend (narrowest set, then
 * soonest expiry) and that stays the rule — which package gets burned is a
 * separate question from how many sessions the client can still book. The
 * WARNING and the LOCK must describe the SPENDABLE POOL instead: a client
 * holding a 9-remaining Reformer 12-pack beside a 1-session "Nadoknada" makeup
 * package has ten bookable sessions, not one, but the makeup package wins spend
 * priority on expiry — so per-package math told them every booking was their
 * last, and a fully-held makeup package locked them out entirely while nine
 * credits sat spendable.
 *
 * The pool is the set of packages sharing an identical covered ClassType set —
 * the same grouping `lib/active-package-summary.ts` shows on the home screen
 * (CONTEXT.md → PackageType, ADR-0010). Credits are interchangeable only within
 * an identical set: a Personalni credit cannot cover a Reformer session, and a
 * Reformer+Energy mix credit, while spendable here, belongs to a wider pool
 * whose flexibility the spend rule deliberately preserves.
 */
import {
  bookableSessions,
  canHoldAnotherBooking,
  isLastBookableSlot,
} from "@/lib/server/package-hold";
import type { EligibilityPackage } from "@/lib/server/package-eligibility";

/** The subset of an eligibility package the pool math reads. */
type PoolPackage = Pick<
  EligibilityPackage,
  "id" | "classTypeIds" | "sessionsRemaining" | "startsAt" | "expiresAt" | "revokedAt"
>;

/**
 * Order-independent identity for a covered ClassType set — sorted ids joined,
 * so the same scope arriving in whatever order the query serialized it lands in
 * one pool. Mirrors `coveredSetKey` in `lib/active-package-summary.ts`; a
 * package with no snapshotted set gets its own bucket, since an unknown scope
 * is not evidence of a shared one.
 */
export function coveredSetKeyOf(pkg: Pick<PoolPackage, "classTypeIds">): string {
  if (pkg.classTypeIds.length === 0) return " unscoped";
  return [...pkg.classTypeIds].sort().join(" ");
}

/**
 * The packages whose credits are interchangeable with `spendPackage`'s: same
 * covered set, still live at `at` (started, unexpired, unrevoked, credits
 * left). `spendPackage` is itself a member — it came out of
 * `findEligibleClientPackage`, which applied the same liveness filters plus the
 * pause check, so a pause is already excluded upstream by the time a spend
 * package exists.
 */
export function poolMembers(
  packages: PoolPackage[],
  spendPackage: Pick<PoolPackage, "classTypeIds">,
  at: Date,
): PoolPackage[] {
  const key = coveredSetKeyOf(spendPackage);
  return packages.filter(
    (pkg) =>
      coveredSetKeyOf(pkg) === key &&
      !pkg.revokedAt &&
      pkg.sessionsRemaining > 0 &&
      pkg.startsAt <= at &&
      pkg.expiresAt >= at,
  );
}

/**
 * Holds against the whole pool, without double-counting the waitlist.
 *
 * `countHeldSessions` scopes BOOKINGS by `clientPackageId` but WAITLIST entries
 * by class type — waitlist rows carry no package FK. Calling it once per pool
 * member and summing would therefore count each waitlist seat once per package:
 * a client with one waitlist entry and three same-set packages would read as
 * three holds. Bookings sum across the pool's package ids; the waitlist is
 * counted ONCE for the covered set.
 */
export function poolHeldCount(input: {
  bookingCountsByPackageId: Record<string, number>;
  waitlistCount: number;
}): number {
  const bookings = Object.values(input.bookingCountsByPackageId).reduce(
    (sum, count) => sum + count,
    0,
  );
  return bookings + input.waitlistCount;
}

function poolRemaining(packages: PoolPackage[]): number {
  return packages.reduce((sum, pkg) => sum + pkg.sessionsRemaining, 0);
}

/** How many MORE sessions the client can reserve from this pool right now. */
export function poolBookableSlots(input: {
  packages: PoolPackage[];
  heldCount: number;
}): number {
  return bookableSessions({
    sessionsRemaining: poolRemaining(input.packages),
    heldCount: input.heldCount,
  });
}

/**
 * True while ANY credit in the pool is still free. The availability route's
 * FULLY_HELD lock and the booking route's PACKAGE_EXHAUSTED 409 both read this,
 * so a row the calendar shows as bookable cannot 409 on tap.
 */
export function poolCanHoldAnotherBooking(input: {
  packages: PoolPackage[];
  heldCount: number;
}): boolean {
  return canHoldAnotherBooking({
    sessionsRemaining: poolRemaining(input.packages),
    heldCount: input.heldCount,
  });
}

/**
 * True only when the POOL has exactly one free slot left — the honest trigger
 * for the "this booking spends your last session, renew" warning.
 */
export function poolIsLastBookableSlot(input: {
  packages: PoolPackage[];
  heldCount: number;
}): boolean {
  return isLastBookableSlot({
    sessionsRemaining: poolRemaining(input.packages),
    heldCount: input.heldCount,
  });
}

/**
 * Which package in the pool the booking actually attaches to.
 *
 * Spend priority is UNCHANGED — the spend package `findEligibleClientPackage`
 * returned is kept whenever its own credits still have room. This only skips a
 * member whose own credits are already committed to future bookings, and falls
 * through to the next member by the same priority order (narrowest set, then
 * soonest expiry; every pool member shares a set, so expiry decides).
 *
 * Why it has to: consumption decrements the BOOKING's `clientPackageId` and
 * no-ops at zero (`decrementPackageSessions`). Once the gate is pool-aware, a
 * 1-session makeup package beside a 9-session pack would otherwise take an
 * eleventh booking onto the makeup package and silently lose a paid credit.
 *
 * Waitlist holds are deliberately NOT counted here: a waitlist row carries no
 * package FK, so it can't over-commit a specific package's decrement. It still
 * counts against the POOL's headroom — that's `poolHeldCount`'s job.
 *
 * Null when every member is committed; callers treat that as the pool being
 * exhausted, same as the gate refusing the hold.
 */
export function pickPoolPackageWithHeadroom<T extends PoolPackage>(input: {
  members: T[];
  spendPackage: T;
  bookingCountsByPackageId: Record<string, number>;
}): T | null {
  const hasHeadroom = (pkg: T) =>
    (input.bookingCountsByPackageId[pkg.id] ?? 0) < pkg.sessionsRemaining;

  if (hasHeadroom(input.spendPackage)) return input.spendPackage;

  const fallbacks = input.members
    .filter((pkg) => pkg.id !== input.spendPackage.id && hasHeadroom(pkg))
    .sort(
      (a, b) =>
        a.classTypeIds.length - b.classTypeIds.length ||
        a.expiresAt.getTime() - b.expiresAt.getTime(),
    );
  return fallbacks[0] ?? null;
}
