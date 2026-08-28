/**
 * Trainer schedule stat strip — a closed slot is not work.
 *
 * The empty-booking cutoff shuts signups on a session nobody booked. The
 * Session row is untouched (`status: "SCHEDULED"`), so the day's TERMINI and
 * SATI kept counting a slot the trainer was never going to run — the studio
 * reported seeing "3 termina" on a day with 2. The closed slot must still
 * appear in the schedule below, badged "Zatvoreno", so staff can plan around
 * the gap; only the headline numbers drop it.
 *
 * Mounts the real screen against a seeded availability cache, so the whole
 * cache → filter → StatColumn path runs the way production does.
 */
import { describe, it, expect } from "vitest";
import { waitFor } from "@testing-library/react";
import React from "react";
import dayjs from "dayjs";
import "@/lib/i18n";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import { renderWithQueryClient } from "./helpers";
import TrainerSchedule from "@/app/(trainer)/raspored/index";

// The screen anchors on the wall-clock day, so the fixtures do too.
const today = dayjs().startOf("day");
const month = today.format("YYYY-MM");

function availabilitySession(opts: {
  id: string;
  startHour: number;
  durationMinutes: number;
  bookedCount: number;
  emptyCutoffLocked?: boolean;
}) {
  const startsAt = today.hour(opts.startHour);
  return {
    id: opts.id,
    startsAt: startsAt.toDate(),
    endsAt: startsAt.add(opts.durationMinutes, "minute").toDate(),
    classTypeName: "Reformer pilates",
    roomId: "r1",
    roomName: "Sala 1",
    trainerUserId: "t1",
    trainerName: "Ana Trener",
    capacity: 6,
    bookedCount: opts.bookedCount,
    waitlistCount: 0,
    availableSlots: 6 - opts.bookedCount,
    recurringScheduleId: null,
    isActive: true,
    isBookedByMe: false,
    isWaitlistedByMe: false,
    lateCancelHours: null,
    emptyCutoffLocked: opts.emptyCutoffLocked,
    bookable: true,
    lastBookableSlot: false,
  };
}

function renderSchedule(sessions: ReturnType<typeof availabilitySession>[]) {
  return renderWithQueryClient(<TrainerSchedule />, (client) => {
    client.setQueryData(sessionsQueries.availabilityByMonth(month).queryKey, {
      success: true,
      month,
      sessions,
    });
    client.setQueryData(authQueries.me().queryKey, {
      success: true,
      user: {
        id: "t1",
        email: "ana@baza.rs",
        firstName: "Ana",
        lastName: "Trener",
        fullName: "Ana Trener",
        role: "TRAINER",
        isActive: true,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        clientProfile: null,
      },
    });
  });
}

const OPEN_MORNING = availabilitySession({
  id: "s1",
  startHour: 8,
  durationMinutes: 50,
  bookedCount: 4,
});
const CLOSED_MIDDAY = availabilitySession({
  id: "s2",
  startHour: 12,
  durationMinutes: 60,
  bookedCount: 0,
  emptyCutoffLocked: true,
});
const OPEN_EVENING = availabilitySession({
  id: "s3",
  startHour: 18,
  durationMinutes: 60,
  bookedCount: 3,
});

describe("trainer schedule stats exclude auto-closed sessions", () => {
  it("counts every session on a day with nothing closed", async () => {
    const screen = renderSchedule([OPEN_MORNING, OPEN_EVENING]);

    await waitFor(() => {
      expect(screen.getByText("2")).toBeTruthy();
    });
    // 50 + 60 minutes of real work.
    expect(screen.getByText("1.8")).toBeTruthy();
    // 4 + 3 booked clients.
    expect(screen.getByText("7")).toBeTruthy();
  });

  it("drops the closed session from TERMINI and SATI but still shows it", async () => {
    const screen = renderSchedule([OPEN_MORNING, CLOSED_MIDDAY, OPEN_EVENING]);

    await waitFor(() => {
      // Three sessions on the wire, two the trainer will work.
      expect(screen.getByText("2")).toBeTruthy();
    });
    // The closed hour is not in the total.
    expect(screen.getByText("1.8")).toBeTruthy();
    expect(screen.queryByText("2.8")).toBeNull();

    // …and the slot is still on the schedule, marked closed.
    expect(screen.getByTestId("session-block-empty-cutoff-s2")).toBeTruthy();
  });

  it("reads as an empty day when every session is closed", async () => {
    const screen = renderSchedule([
      CLOSED_MIDDAY,
      availabilitySession({
        id: "s4",
        startHour: 19,
        durationMinutes: 60,
        bookedCount: 0,
        emptyCutoffLocked: true,
      }),
    ]);

    await waitFor(() => {
      expect(screen.getByTestId("session-block-empty-cutoff-s2")).toBeTruthy();
    });
    // StatColumn renders zero as an em-dash — all three columns are quiet.
    expect(screen.getAllByText("—")).toHaveLength(3);
  });
});
