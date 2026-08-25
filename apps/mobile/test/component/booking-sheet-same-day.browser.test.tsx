/**
 * Same-day double-booking warning — Vitest Browser Mode (real Chromium, real
 * react-native-web, real i18n with the shipped Serbian copy).
 *
 * Two halves: the presentational BookingSheet renders the warning only in the
 * confirm-book step, and ClientBookingSheet derives the flag from the live
 * availability array. The day-boundary cases live on the deriving half —
 * that's where the studio-day comparison happens.
 */
import { describe, it, expect } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import React from "react";
import "@/lib/i18n";
import { BookingSheet } from "@/components/client/booking-sheet";
import {
  ClientBookingSheet,
  useBookingSheet,
  type BookingSheetController,
} from "@/components/client/use-booking-sheet";
import { renderWithQueryClient } from "./helpers";
import type { AvailabilitySession } from "@baza/types/scheduling";

const HOUR = 60 * 60 * 1000;

/** A bookable Reformer session; startsAt is required so day math is explicit. */
function makeSession(
  overrides: Partial<AvailabilitySession> & { startsAt: Date },
): AvailabilitySession {
  return {
    id: "session-1",
    capacity: 6,
    endsAt: new Date(overrides.startsAt.getTime() + HOUR),
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

const noop = () => {};

/**
 * A Belgrade wall-clock instant, as a UTC Date. Belgrade is UTC+2 in
 * mid-August (CEST), so 07:00 local is 05:00Z — the tests name the local
 * time they mean and this converts once.
 */
function belgrade(day: number, hour: number, minute = 0): Date {
  return new Date(Date.UTC(2099, 7, day, hour - 2, minute));
}

function renderSheet(
  props: Partial<React.ComponentProps<typeof BookingSheet>> = {},
) {
  return render(
    <BookingSheet
      session={makeSession({ startsAt: belgrade(12, 18) })}
      onClose={noop}
      onBook={noop}
      onCancel={noop}
      onLeaveWaitlist={noop}
      pending={false}
      successState={null}
      errorCode={null}
      hasOtherBookingSameDay={false}
      {...props}
    />,
  );
}

describe("BookingSheet same-day warning rendering", () => {
  it("warns in the confirm step when another booking that day exists", async () => {
    const screen = renderSheet({ hasOtherBookingSameDay: true });

    fireEvent.click(await screen.findByTestId("booking-book-button"));

    const warning = screen.getByTestId("booking-same-day-warning");
    expect(warning.textContent).toContain(
      "Već imate zakazan termin tog dana",
    );
  });

  it("stays hidden on the idle step — it belongs to the confirm decision", async () => {
    const screen = renderSheet({ hasOtherBookingSameDay: true });

    await screen.findByTestId("booking-book-button");
    expect(screen.queryByTestId("booking-same-day-warning")).toBeNull();
  });

  it("stays hidden in the confirm step when there is no other booking", async () => {
    const screen = renderSheet({ hasOtherBookingSameDay: false });

    fireEvent.click(await screen.findByTestId("booking-book-button"));

    expect(screen.getByTestId("booking-confirm-book-button")).toBeTruthy();
    expect(screen.queryByTestId("booking-same-day-warning")).toBeNull();
  });

  it("renders alongside the last-slot warning, last-slot first", async () => {
    const screen = renderSheet({
      session: makeSession({
        startsAt: belgrade(12, 18),
        lastBookableSlot: true,
      }),
      hasOtherBookingSameDay: true,
    });

    fireEvent.click(await screen.findByTestId("booking-book-button"));

    const lastSlot = screen.getByTestId("booking-last-slot-warning");
    const sameDay = screen.getByTestId("booking-same-day-warning");
    expect(
      lastSlot.compareDocumentPosition(sameDay) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

/** Drives ClientBookingSheet with a session already open, as a screen would. */
function OpenSheet({
  sessions,
  openId,
}: {
  sessions: AvailabilitySession[];
  openId: string;
}) {
  const controller: BookingSheetController = useBookingSheet();
  const target = sessions.find((s) => s.id === openId);
  if (target && controller.selectedSession?.id !== openId) {
    controller.open(target);
  }
  return <ClientBookingSheet controller={controller} sessions={sessions} />;
}

async function renderOpenSheet(sessions: AvailabilitySession[], openId: string) {
  const screen = renderWithQueryClient(
    <OpenSheet sessions={sessions} openId={openId} />,
  );
  fireEvent.click(await screen.findByTestId("booking-book-button"));
  return screen;
}

describe("ClientBookingSheet same-day derivation", () => {
  const selected = () =>
    makeSession({ id: "selected", startsAt: belgrade(12, 18) });

  it("flags a confirmed booking earlier the same studio day", async () => {
    const screen = await renderOpenSheet(
      [
        selected(),
        makeSession({
          id: "morning",
          startsAt: belgrade(12, 8),
          isBookedByMe: true,
        }),
      ],
      "selected",
    );

    expect(screen.getByTestId("booking-same-day-warning")).toBeTruthy();
  });

  it("ignores a session that day the client is only waitlisted on", async () => {
    const screen = await renderOpenSheet(
      [
        selected(),
        makeSession({
          id: "morning",
          startsAt: belgrade(12, 8),
          isWaitlistedByMe: true,
          availableSlots: 0,
          bookedCount: 6,
          waitlistCount: 1,
        }),
      ],
      "selected",
    );

    expect(screen.queryByTestId("booking-same-day-warning")).toBeNull();
  });

  it("ignores the selected session's own booked flag", async () => {
    // Booking again from a session already marked booked would otherwise
    // warn about itself.
    const screen = await renderOpenSheet(
      [makeSession({ id: "selected", startsAt: belgrade(12, 18) })],
      "selected",
    );

    expect(screen.queryByTestId("booking-same-day-warning")).toBeNull();
  });

  it("does not flag a booking on the next calendar day", async () => {
    const screen = await renderOpenSheet(
      [
        selected(),
        makeSession({
          id: "tomorrow",
          startsAt: belgrade(13, 18),
          isBookedByMe: true,
        }),
      ],
      "selected",
    );

    expect(screen.queryByTestId("booking-same-day-warning")).toBeNull();
  });

  it("does not flag across the midnight boundary — 21:00 vs next 07:00", async () => {
    // Ten hours apart in wall-clock terms, but two different studio days.
    const screen = await renderOpenSheet(
      [
        makeSession({ id: "selected", startsAt: belgrade(12, 21) }),
        makeSession({
          id: "early-next",
          startsAt: belgrade(13, 7),
          isBookedByMe: true,
        }),
      ],
      "selected",
    );

    expect(screen.queryByTestId("booking-same-day-warning")).toBeNull();
  });

  it("flags a 07:00/21:00 pair that shares one studio day", async () => {
    const screen = await renderOpenSheet(
      [
        makeSession({ id: "selected", startsAt: belgrade(12, 21) }),
        makeSession({
          id: "early-same",
          startsAt: belgrade(12, 7),
          isBookedByMe: true,
        }),
      ],
      "selected",
    );

    expect(screen.getByTestId("booking-same-day-warning")).toBeTruthy();
  });

  it("picks the booking out of a day crowded with other clients' sessions", async () => {
    const screen = await renderOpenSheet(
      [
        makeSession({ id: "selected", startsAt: belgrade(12, 18) }),
        makeSession({ id: "other-1", startsAt: belgrade(12, 9) }),
        makeSession({ id: "other-2", startsAt: belgrade(12, 12) }),
        makeSession({
          id: "mine",
          startsAt: belgrade(12, 20),
          isBookedByMe: true,
        }),
        makeSession({ id: "other-3", startsAt: belgrade(13, 9) }),
      ],
      "selected",
    );

    expect(screen.getByTestId("booking-same-day-warning")).toBeTruthy();
  });
});
