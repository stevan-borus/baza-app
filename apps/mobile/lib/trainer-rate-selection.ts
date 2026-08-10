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
};

function newestFirst(a: TrainerRateRow, b: TrainerRateRow) {
  return (
    new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime()
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
