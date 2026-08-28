/**
 * Trainer schedule headline stats — TERMINI / KLIJENTI / SATI.
 *
 * A session the studio auto-closed for being empty ("Zatvoreno") is still a
 * SCHEDULED row on the wire — nothing about it is cancelled — so the old
 * inline reduces counted it as work the trainer would show up for. The studio
 * decided it must not: the trainer will not run that slot, so it owes neither
 * a termin nor its minutes. It still renders in the calendar below, which is
 * why the flag is display-only and the filter lives here, not on the server.
 */
import { describe, expect, it } from "vitest";

import { computeTrainerDayStats } from "@/lib/trainer-day-stats";

function session(opts: {
  start: string;
  end: string;
  bookedCount?: number;
  emptyCutoffLocked?: boolean;
}) {
  return {
    startsAt: opts.start,
    endsAt: opts.end,
    bookedCount: opts.bookedCount ?? 0,
    ...(opts.emptyCutoffLocked === undefined
      ? {}
      : { emptyCutoffLocked: opts.emptyCutoffLocked }),
  };
}

describe("computeTrainerDayStats", () => {
  it("counts every session on an ordinary day", () => {
    const stats = computeTrainerDayStats([
      session({
        start: "2026-06-10T08:00:00.000Z",
        end: "2026-06-10T08:50:00.000Z",
        bookedCount: 4,
      }),
      session({
        start: "2026-06-10T10:00:00.000Z",
        end: "2026-06-10T11:00:00.000Z",
        bookedCount: 2,
      }),
    ]);

    expect(stats.sessionCount).toBe(2);
    expect(stats.clientCount).toBe(6);
    expect(stats.hours).toBeCloseTo(110 / 60);
    expect(stats.hoursDisplay).toBe("1.8");
  });

  it("drops a closed session from the count and the hours", () => {
    const stats = computeTrainerDayStats([
      session({
        start: "2026-06-10T08:00:00.000Z",
        end: "2026-06-10T08:50:00.000Z",
        bookedCount: 4,
      }),
      session({
        start: "2026-06-10T10:00:00.000Z",
        end: "2026-06-10T11:00:00.000Z",
        emptyCutoffLocked: true,
      }),
      session({
        start: "2026-06-10T12:00:00.000Z",
        end: "2026-06-10T13:00:00.000Z",
        bookedCount: 3,
      }),
    ]);

    expect(stats.sessionCount).toBe(2);
    expect(stats.clientCount).toBe(7);
    expect(stats.hours).toBeCloseTo(110 / 60);
    expect(stats.hoursDisplay).toBe("1.8");
  });

  it("reports an empty day when every session is closed", () => {
    const stats = computeTrainerDayStats([
      session({
        start: "2026-06-10T08:00:00.000Z",
        end: "2026-06-10T08:50:00.000Z",
        emptyCutoffLocked: true,
      }),
      session({
        start: "2026-06-10T10:00:00.000Z",
        end: "2026-06-10T11:00:00.000Z",
        emptyCutoffLocked: true,
      }),
    ]);

    expect(stats.sessionCount).toBe(0);
    expect(stats.clientCount).toBe(0);
    expect(stats.hours).toBe(0);
    // StatColumn renders "0" as an em-dash, so the quiet day stays elegant.
    expect(stats.hoursDisplay).toBe("0");
  });

  it("treats an absent flag as open (older cached payloads)", () => {
    const stats = computeTrainerDayStats([
      session({
        start: "2026-06-10T08:00:00.000Z",
        end: "2026-06-10T09:00:00.000Z",
        bookedCount: 1,
      }),
      session({
        start: "2026-06-10T10:00:00.000Z",
        end: "2026-06-10T11:00:00.000Z",
        emptyCutoffLocked: false,
      }),
    ]);

    expect(stats.sessionCount).toBe(2);
    expect(stats.hoursDisplay).toBe("2.0");
  });

  it("accepts Date instances as well as ISO strings", () => {
    const stats = computeTrainerDayStats([
      {
        startsAt: new Date("2026-06-10T08:00:00.000Z"),
        endsAt: new Date("2026-06-10T09:30:00.000Z"),
        bookedCount: 2,
      },
    ]);

    expect(stats.sessionCount).toBe(1);
    expect(stats.hoursDisplay).toBe("1.5");
  });

  it("returns zeroes for a day with no sessions at all", () => {
    const stats = computeTrainerDayStats([]);

    expect(stats).toEqual({
      sessionCount: 0,
      clientCount: 0,
      hours: 0,
      hoursDisplay: "0",
    });
  });
});
