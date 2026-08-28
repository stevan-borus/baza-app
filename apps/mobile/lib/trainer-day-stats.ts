/**
 * Headline stats for the trainer schedule day — TERMINI / KLIJENTI / SATI.
 *
 * A session the empty-booking cutoff closed is still `status: "SCHEDULED"` on
 * the wire; `emptyCutoffLocked` is a derived, display-only flag. The trainer
 * will not run that slot, so it counts toward neither the termin count nor the
 * working hours — the studio was explicit about both. It still renders in the
 * calendar below with its "Zatvoreno" badge, which is why the flag is filtered
 * here rather than at the query.
 *
 * KLIJENTI applies the same filter even though a closed session has zero
 * active bookings by definition (that is what closed it): one filtered list
 * feeding all three numbers is what keeps them provably consistent.
 */
import dayjs from "dayjs";

export type TrainerDayStatsSession = {
  startsAt: string | Date;
  endsAt: string | Date;
  bookedCount: number;
  emptyCutoffLocked?: boolean;
};

export type TrainerDayStats = {
  sessionCount: number;
  clientCount: number;
  hours: number;
  /** Pre-formatted for StatColumn, which renders "0" as an em-dash. */
  hoursDisplay: string;
};

export function computeTrainerDayStats(
  sessions: TrainerDayStatsSession[],
): TrainerDayStats {
  const working = sessions.filter((s) => !s.emptyCutoffLocked);

  const clientCount = working.reduce((sum, s) => sum + s.bookedCount, 0);
  const minutes = working.reduce(
    (sum, s) => sum + dayjs(s.endsAt).diff(dayjs(s.startsAt), "minute"),
    0,
  );
  const hours = minutes / 60;

  return {
    sessionCount: working.length,
    clientCount,
    hours,
    hoursDisplay: hours > 0 ? hours.toFixed(1) : "0",
  };
}
