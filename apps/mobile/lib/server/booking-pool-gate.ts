/**
 * THE booking gate. Both the availability route (which decides whether a
 * calendar row renders bookable and whether it carries the last-session
 * warning) and the booking route (which 409s `package_exhausted`) resolve
 * their answer here, so a row the calendar shows as bookable cannot 409 on tap.
 * Duplicating this math is exactly how the two drifted before.
 *
 * The gate is POOL-scoped: it measures every package sharing the spend
 * package's covered ClassType set, not just the one package spend priority
 * picked. See `lib/server/package-pool.ts` for why.
 */
import type { Prisma } from "@/generated/prisma";
import {
  countPoolBookingsByPackage,
  countPoolWaitlistHolds,
} from "@/lib/server/booking-hold-count";
import type { EligibilityPackage } from "@/lib/server/package-eligibility";
import {
  coveredSetKeyOf,
  pickPoolPackageWithHeadroom,
  poolCanHoldAnotherBooking,
  poolHeldCount,
  poolIsLastBookableSlot,
  poolMembers,
} from "@/lib/server/package-pool";

type Db = Prisma.TransactionClient;

/** Per-package booking holds plus the pool's single waitlist count. */
export type PoolHoldCounts = {
  bookingCountsByPackageId: Record<string, number>;
  waitlistCount: number;
};

export type PoolBookingGate = {
  /** Any credit in the pool is still free — safe to hold another booking. */
  canHoldAnotherBooking: boolean;
  /** The pool is down to exactly one free slot. */
  lastBookableSlot: boolean;
  /**
   * The package a new booking must attach to — the spend package unless its own
   * credits are already committed, in which case the next pool member by the
   * same priority. Null when nothing in the pool has room, which always
   * coincides with `canHoldAnotherBooking: false`.
   */
  packageToSpend: EligibilityPackage | null;
};

/**
 * Resolves the gate for one prospective booking.
 *
 * `spendPackage` is whatever `findEligibleClientPackage` returned — it still
 * decides which package gets burned; this only answers "how much is left in
 * the pool it belongs to".
 *
 * The two instants are deliberately separate: membership at the session's date
 * (pre-booking a funded future window is allowed), holds at now.
 *
 * `heldCountCache` is optional and keyed by covered-set key so a month of
 * availability rows resolves one pair of queries per pool instead of a pair per
 * session.
 * Callers inside a transaction (the booking route) pass none: the count must
 * be fresh so two concurrent requests can't both claim the last slot.
 */
export async function resolvePoolBookingGate(
  tx: Db,
  params: {
    clientProfileId: string;
    packages: EligibilityPackage[];
    spendPackage: EligibilityPackage;
    /**
     * The SESSION's start instant — pool membership is evaluated here, exactly
     * like `findEligibleClientPackage`, so a pack whose funded window opens
     * later still backs sessions inside that window (pre-booking is allowed).
     */
    sessionInstant: Date;
    /**
     * NOW — holds are "what is already committed at this moment", so bookings
     * and waitlist seats are counted from here, never from the session date.
     */
    at: Date;
    heldCountCache?: Map<string, PoolHoldCounts>;
  },
): Promise<PoolBookingGate> {
  const members = poolMembers(
    params.packages,
    params.spendPackage,
    params.sessionInstant,
  );
  const key = coveredSetKeyOf(params.spendPackage);

  const cached = params.heldCountCache?.get(key);
  const counts =
    cached ??
    (await (async () => {
      const [bookingCountsByPackageId, waitlistCount] = await Promise.all([
        countPoolBookingsByPackage(tx, {
          clientProfileId: params.clientProfileId,
          clientPackageIds: members.map((pkg) => pkg.id),
          at: params.at,
        }),
        // Every member snapshots the same set, so the spend package's set IS
        // the pool's set — the waitlist scope is unambiguous, and counted ONCE
        // for the whole pool rather than per member.
        countPoolWaitlistHolds(tx, {
          clientProfileId: params.clientProfileId,
          classTypeIds: params.spendPackage.classTypeIds,
          at: params.at,
        }),
      ]);
      return { bookingCountsByPackageId, waitlistCount };
    })());
  params.heldCountCache?.set(key, counts);

  const heldCount = poolHeldCount(counts);

  return {
    canHoldAnotherBooking: poolCanHoldAnotherBooking({
      packages: members,
      heldCount,
    }),
    lastBookableSlot: poolIsLastBookableSlot({ packages: members, heldCount }),
    packageToSpend: pickPoolPackageWithHeadroom({
      members,
      spendPackage: params.spendPackage,
      bookingCountsByPackageId: counts.bookingCountsByPackageId,
    }),
  };
}
