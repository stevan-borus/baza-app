/**
 * `hasOtherBookingOnStudioDay` — the day-boundary half of the same-day
 * double-booking warning. The rendering half is covered by
 * test/component/booking-sheet-same-day.browser.test.tsx.
 *
 * These pin `process.env.TZ` because that is the whole point of the helper:
 * the answer must be the studio's calendar day regardless of where the
 * client's phone thinks it is.
 */
import { describe, it, expect, afterEach } from "vitest";
import { hasOtherBookingOnStudioDay } from "@/lib/same-day-booking";
import type { AvailabilitySession } from "@baza/types/scheduling";

const HOUR = 60 * 60 * 1000;

/** A Belgrade wall-clock instant in August (CEST, UTC+2), as a UTC Date. */
function belgrade(day: number, hour: number, minute = 0): Date {
  return new Date(Date.UTC(2099, 7, day, hour - 2, minute));
}

function session(
  id: string,
  startsAt: Date,
  overrides: Partial<AvailabilitySession> = {},
): AvailabilitySession {
  return {
    id,
    capacity: 6,
    startsAt,
    endsAt: new Date(startsAt.getTime() + HOUR),
    classTypeName: "Reformer pilates",
    roomName: "Sala 1",
    trainerName: "Trainer Reformer Lead",
    bookedCount: 3,
    waitlistCount: 0,
    availableSlots: 3,
    lateCancelHours: 8,
    ...overrides,
  };
}

const originalTz = process.env.TZ;
afterEach(() => {
  process.env.TZ = originalTz;
});

/** Every runtime zone must agree — that's the contract, not an average. */
function acrossTimezones(run: () => boolean): boolean[] {
  return ["Europe/Belgrade", "UTC", "Pacific/Auckland", "America/Los_Angeles"].map(
    (tz) => {
      process.env.TZ = tz;
      return run();
    },
  );
}

describe("hasOtherBookingOnStudioDay", () => {
  it("finds a confirmed booking earlier the same studio day", () => {
    const selected = session("selected", belgrade(12, 18));
    const morning = session("morning", belgrade(12, 8), { isBookedByMe: true });

    expect(
      acrossTimezones(() => hasOtherBookingOnStudioDay(selected, [selected, morning])),
    ).toEqual([true, true, true, true]);
  });

  it("ignores a session the client is only waitlisted on", () => {
    const selected = session("selected", belgrade(12, 18));
    const morning = session("morning", belgrade(12, 8), {
      isWaitlistedByMe: true,
      availableSlots: 0,
      bookedCount: 6,
      waitlistCount: 1,
    });

    expect(hasOtherBookingOnStudioDay(selected, [selected, morning])).toBe(false);
  });

  it("ignores the selected session's own booked flag", () => {
    const selected = session("selected", belgrade(12, 18), { isBookedByMe: true });

    expect(hasOtherBookingOnStudioDay(selected, [selected])).toBe(false);
  });

  it("does not match a booking on the next calendar day", () => {
    const selected = session("selected", belgrade(12, 18));
    const tomorrow = session("tomorrow", belgrade(13, 18), { isBookedByMe: true });

    expect(
      acrossTimezones(() =>
        hasOtherBookingOnStudioDay(selected, [selected, tomorrow]),
      ),
    ).toEqual([false, false, false, false]);
  });

  it("does not match across midnight — 21:00 and the next 07:00", () => {
    const selected = session("selected", belgrade(12, 21));
    const earlyNext = session("early-next", belgrade(13, 7), { isBookedByMe: true });

    expect(
      acrossTimezones(() =>
        hasOtherBookingOnStudioDay(selected, [selected, earlyNext]),
      ),
    ).toEqual([false, false, false, false]);
  });

  it("matches a 07:00/21:00 pair inside one studio day, in every runtime zone", () => {
    // The regression guard. On an Auckland-set device (UTC+12 in August) the
    // 21:00 class reads as the 13th local while the 07:00 one reads as the
    // 12th — a device-local day key answers false here and the client never
    // gets warned. Los Angeles splits the pair the other way.
    const selected = session("selected", belgrade(12, 21));
    const early = session("early", belgrade(12, 7), { isBookedByMe: true });

    expect(
      acrossTimezones(() => hasOtherBookingOnStudioDay(selected, [selected, early])),
    ).toEqual([true, true, true, true]);
  });

  it("holds across the autumn DST change", () => {
    // 25 Oct 2099: Belgrade falls back from CEST to CET overnight. A fixed
    // +02:00 offset would put the evening class on the wrong date.
    const selected: AvailabilitySession = session(
      "selected",
      new Date("2099-10-25T18:00:00.000+01:00"),
    );
    const morning = session("morning", new Date("2099-10-25T08:00:00.000+01:00"), {
      isBookedByMe: true,
    });

    expect(
      acrossTimezones(() => hasOtherBookingOnStudioDay(selected, [selected, morning])),
    ).toEqual([true, true, true, true]);
  });
});
