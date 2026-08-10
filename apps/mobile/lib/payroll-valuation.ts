import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { STUDIO_DAY_START_HOUR, STUDIO_TIMEZONE } from "@/lib/studio-time";

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Trainer compensation, the pure part.
 *
 * The studio pays each trainer an agreed percentage of the value of the
 * sessions they held, where a session's value is the sum of what each attendee
 * paid for that one training — their package price divided by the number of
 * sessions the package granted. The owner's worked example:
 *
 *   Paket 1 = 15.000 / 12 → 1.250 per training
 *   Paket 2 = 11.000 /  8 → 1.375 per training
 *   a session with 2× Paket 1 + 1× Paket 2 → 3.875 gross
 *
 * No DB access here on purpose: the money rule is the part worth testing in
 * isolation, and the query layer decides WHICH bookings count.
 */

export type PayrollAttendee = {
  bookingId: string;
  clientProfileId: string;
  clientName: string;
  packageName: string;
  /** RSD. Null when the package type carries no price — never treated as 0. */
  packagePrice: number | null;
  /**
   * The count the price is spread over: the package's granted sessions plus
   * any "+1 termin" grant. Callers pass `packageSessionsTotal(pkg)`.
   */
  sessionsTotal: number;
  /**
   * A gift/comp attendance. Valued exactly like a paid one — the house
   * absorbs the cost, but the trainer did the work and is paid for it. Flagged
   * so the studio can see what it absorbed.
   */
  isGift: boolean;
};

export type PayrollLine = PayrollAttendee & {
  /** Null when the package has no price (or a nonsensical total). */
  sessionValue: number | null;
};

export type ValuedSession = {
  lines: PayrollLine[];
  /** Sum of the priced lines, in RSD. */
  gross: number;
  /** Lines that could not be valued — surfaced, never silently zero. */
  unpricedCount: number;
  /** The trainer's cut of `gross` at `percent`, rounded to whole dinars. */
  payout: (percent: number) => number;
};

/**
 * Value one held session from everyone who attended it.
 */
export function valueSession(attendees: PayrollAttendee[]): ValuedSession {
  const lines: PayrollLine[] = attendees.map((attendee) => ({
    ...attendee,
    sessionValue:
      attendee.packagePrice === null || attendee.sessionsTotal <= 0
        ? null
        : attendee.packagePrice / attendee.sessionsTotal,
  }));

  const gross = lines.reduce((sum, line) => sum + (line.sessionValue ?? 0), 0);
  const unpricedCount = lines.filter((line) => line.sessionValue === null).length;

  return {
    lines,
    gross,
    unpricedCount,
    payout: (percent: number) => Math.round((gross * percent) / 100),
  };
}

/**
 * The half-open instant range covering a calendar month in the studio's own
 * timezone, aligned to the 05:00 opening hour the rest of the app already uses
 * for day boundaries. Month is 1-indexed.
 *
 * Belgrade, not UTC: "July" means July to the person paying, and the DST shift
 * means a fixed offset would drift by an hour for half the year.
 */
export function studioMonthRange(
  year: number,
  month: number,
): { from: Date; to: Date } {
  const from = dayjs
    .tz(
      `${year}-${String(month).padStart(2, "0")}-01 ${String(STUDIO_DAY_START_HOUR).padStart(2, "0")}:00:00`,
      STUDIO_TIMEZONE,
    )
    .toDate();
  const to = dayjs(from).tz(STUDIO_TIMEZONE).add(1, "month").toDate();
  return { from, to };
}
