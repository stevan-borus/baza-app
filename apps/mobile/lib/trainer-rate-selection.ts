import { now } from "@/lib/now";

/**
 * Picking a trainer's current rate out of their append-only rate history.
 *
 * Rates are never edited in place — a new percentage is a new row effective
 * from a date — so "the current rate" is the newest row that has already taken
 * effect. A raise scheduled for next month must not display as today's
 * percentage, or the admin will think it is already applying.
 */

export type TrainerRateRow = {
  id: string;
  trainerUserId: string;
  /**
   * Null is a TOMBSTONE, and only ever appears on a class-type-scoped row:
   * "from effectiveFrom, this class type goes back to the default rate".
   * Ending an override by deleting its row would rewrite settled months, so
   * the end is another append-only entry.
   */
  percent: number | null;
  /** Null (or absent) = the trainer's default rate; set = one class type. */
  classTypeId?: string | null;
  effectiveFrom: string;
  note: string | null;
  createdAt?: string;
  /**
   * Entry order. The reliable tiebreaker between rates sharing an
   * effectiveFrom — `createdAt` ties too, because Postgres now() is
   * transaction time.
   */
  seq?: number;
};

/** Rows in one scope only — an absent classTypeId means the default scope. */
function inScope(rate: TrainerRateRow, classTypeId: string | null) {
  return (rate.classTypeId ?? null) === classTypeId;
}

/**
 * Newest first, and — crucially — most-recently-ENTERED first among rates that
 * share an effectiveFrom.
 *
 * Rates start at the studio day boundary, so every rate an admin sets today
 * carries the identical effectiveFrom. Comparing only that field leaves them
 * tied, and a tie means the winner is whatever order the rows arrived in: the
 * screen showed the FIRST percentage typed and the payout used an arbitrary
 * one. Correcting a typo was impossible without waiting for tomorrow.
 */
function newestFirst(a: TrainerRateRow, b: TrainerRateRow) {
  const byEffective =
    new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime();
  if (byEffective !== 0) return byEffective;
  const bySeq = (b.seq ?? 0) - (a.seq ?? 0);
  if (bySeq !== 0) return bySeq;
  return (
    new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
  );
}

export function currentTrainerRate(
  rates: TrainerRateRow[],
  trainerUserId: string,
  classTypeId: string | null = null,
): TrainerRateRow | undefined {
  return newestRateAt(rates, trainerUserId, classTypeId, now());
}

/**
 * Every rate for one trainer in one scope, newest first — including any
 * scheduled for the future, which the admin needs to see so they don't set the
 * same raise twice.
 */
export function trainerRateHistory(
  rates: TrainerRateRow[],
  trainerUserId: string,
  classTypeId: string | null = null,
): TrainerRateRow[] {
  return rates
    .filter(
      (rate) => rate.trainerUserId === trainerUserId && inScope(rate, classTypeId),
    )
    .sort(newestFirst);
}

/**
 * What a session of `classTypeId` pays at `at`, as a whole percent.
 *
 * A trainer's cut is not one number: an individual or a duo is worth a
 * different percentage to the studio than a group slot. So each class type may
 * carry its own override, and everything without one is paid the default.
 *
 * Two scopes, checked in order:
 *   1. The newest row scoped to this class type that has taken effect. A real
 *      percent wins outright; a NULL one is a tombstone that says "this
 *      override is over" and hands the question back to —
 *   2. the newest default-scope row that has taken effect, or null when the
 *      trainer has no rate at all (which the caller surfaces rather than
 *      inventing a percentage).
 */
export function effectiveTrainerPercentFor(
  rates: TrainerRateRow[],
  trainerUserId: string,
  classTypeId: string | null,
  at: Date,
): number | null {
  if (classTypeId !== null) {
    const override = newestRateAt(rates, trainerUserId, classTypeId, at);
    if (override && override.percent !== null) return override.percent;
  }
  return newestRateAt(rates, trainerUserId, null, at)?.percent ?? null;
}

/**
 * Whether this class type is priced by an override of its own at `at`, as
 * opposed to inheriting the default.
 *
 * The scope is what makes an override, not the number: one deliberately set to
 * the same percentage as the default is still its own agreement, and folding it
 * away would hide a rate the admin can see on the trainer's screen — and
 * silently un-fold it the day the default moved. A tombstoned scope is NOT an
 * override; it has been handed back.
 */
export function hasLiveOverride(
  rates: TrainerRateRow[],
  trainerUserId: string,
  classTypeId: string,
  at: Date,
): boolean {
  return newestRateAt(rates, trainerUserId, classTypeId, at)?.percent != null;
}

/** The newest row in one scope that has taken effect by `at`. */
function newestRateAt(
  rates: TrainerRateRow[],
  trainerUserId: string,
  classTypeId: string | null,
  at: Date,
): TrainerRateRow | undefined {
  const atMs = at.getTime();
  return rates
    .filter(
      (rate) =>
        rate.trainerUserId === trainerUserId &&
        inScope(rate, classTypeId) &&
        new Date(rate.effectiveFrom).getTime() <= atMs,
    )
    .sort(newestFirst)[0];
}
