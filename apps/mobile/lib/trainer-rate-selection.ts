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
  percent: number;
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
): TrainerRateRow | undefined {
  const today = now().getTime();
  return rates
    .filter(
      (rate) =>
        rate.trainerUserId === trainerUserId &&
        new Date(rate.effectiveFrom).getTime() <= today,
    )
    .sort(newestFirst)[0];
}

/**
 * Every rate for one trainer, newest first — including any scheduled for the
 * future, which the admin needs to see so they don't set the same raise twice.
 */
export function trainerRateHistory(
  rates: TrainerRateRow[],
  trainerUserId: string,
): TrainerRateRow[] {
  return rates
    .filter((rate) => rate.trainerUserId === trainerUserId)
    .sort(newestFirst);
}
