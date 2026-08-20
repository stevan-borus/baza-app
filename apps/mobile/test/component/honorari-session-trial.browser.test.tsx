/**
 * Izveštaji → Honorari → one session — the trial (probni) attendance line.
 *
 * A visitor booked without a package produces an unpriced payroll line, and
 * nothing values it automatically: a trial no-show is not work the studio pays
 * for. So the admin has to say the person actually came, and this page is the
 * only place they see the line at all.
 *
 * Two states have to look different at a glance, or the admin cannot tell what
 * still needs their attention: a line waiting for confirmation carries the
 * button, a confirmed one carries the "Probni" chip and its frozen value. An
 * unpriced line with no trial value on its class type carries neither — there
 * is nothing to confirm it against.
 *
 * `apiRequest` is stubbed at the transport seam so the POST is assertable;
 * everything above it (query factory, mutation options, i18n, the screen) is
 * real.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import "@/lib/i18n";
import type { PayrollMonth } from "@baza/types/payroll";
import { renderWithQueryClient } from "./helpers";

type PayrollAttendee = PayrollMonth["sessions"][number]["attendees"][number];

const TRAINER_ID = "trainer-1";
const SESSION_ID = "sess-1";

const posts: { path: string; body: unknown }[] = [];

/** When true the confirm POST rejects the way a rejected booking would. */
let postFails = false;

/** The month the screen reads, rebuilt per spec from its attendee list. */
let attendees: PayrollAttendee[] = [];

function makeMonth(): PayrollMonth {
  const gross = attendees.reduce((sum, a) => sum + (a.sessionValue ?? 0), 0);
  const unpricedCount = attendees.filter((a) => a.sessionValue === null).length;
  return {
    trainerUserId: TRAINER_ID,
    trainerName: "Ana Trener",
    periodStart: "2026-08-01T00:00:00.000Z",
    periodEnd: "2026-08-31T23:59:59.000Z",
    buckets: [
      {
        classTypeId: null,
        classTypeName: null,
        percent: 50,
        gross,
        payout: gross / 2,
      },
    ],
    sessions: [
      {
        sessionId: SESSION_ID,
        startsAt: "2026-08-12T09:00:00.000Z",
        classTypeName: "Grupni pilates",
        attendees,
        gross,
        unpricedCount,
      },
    ],
    sessionCount: 1,
    attendeeCount: attendees.length,
    gross,
    payout: gross / 2,
    adjustmentTotal: 0,
    netPayout: gross / 2,
    unpricedCount,
    giftCount: 0,
    trialCount: attendees.filter((a) => a.isTrial).length,
    adjustments: [],
  };
}

const apiRequestMock = vi.fn(
  async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (opts?.method === "POST") {
      posts.push({ path, body: opts.body });
      if (postFails) throw new Error("Booking is backed by a package");
      return {
        success: true,
        consumption: {
          sessionId: SESSION_ID,
          clientProfileId: "cp-1",
          sessionValue: 1500,
          isTrial: true,
        },
      };
    }
    if (path === "/api/payroll/month") {
      return { success: true, month: makeMonth() };
    }
    return { success: true };
  },
);
vi.mock("@/lib/api-request", () => ({
  apiRequest: (path: string, opts?: Record<string, unknown>) =>
    apiRequestMock(path, opts),
}));

vi.mock("./stubs/expo-router", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useLocalSearchParams: () => ({
      sessionId: SESSION_ID,
      trainerId: TRAINER_ID,
      year: "2026",
      month: "8",
    }),
  };
});

import HonorariSessionDetail from "@/app/(admin)/izvestaji/honorari/sesija/[sessionId]";

/** A package-backed attendee — the ordinary line, neither trial nor gift. */
function packaged(id: string): PayrollAttendee {
  return {
    bookingId: id,
    clientName: `Klijent ${id}`,
    packageName: "Paket 10",
    sessionValue: 1000,
    isGift: false,
    isTrial: false,
    canConfirmTrial: false,
  };
}

beforeEach(() => {
  posts.length = 0;
  attendees = [];
  postFails = false;
  apiRequestMock.mockClear();
});

describe("Honorari session detail — confirming a trial", () => {
  it("offers the confirm button only on a line that can be confirmed", async () => {
    attendees = [
      {
        bookingId: "booking-confirmable",
        clientName: "Mila Probna",
        packageName: "",
        sessionValue: null,
        isGift: false,
        isTrial: false,
        canConfirmTrial: true,
      },
      // Unpriced too, but its class type carries no trial value — there is
      // nothing to confirm it against.
      {
        bookingId: "booking-unvalued",
        clientName: "Petar Bez",
        packageName: "",
        sessionValue: null,
        isGift: false,
        isTrial: false,
        canConfirmTrial: false,
      },
    ];

    const screen = renderWithQueryClient(<HonorariSessionDetail />);

    const button = await screen.findByTestId("confirm-trial-booking-confirmable");
    expect(button.textContent).toContain("Potvrdi probni dolazak");
    expect(screen.queryByTestId("confirm-trial-booking-unvalued")).toBeNull();
  });

  it("marks a confirmed trial with its chip, label and frozen value", async () => {
    attendees = [
      {
        bookingId: "consumption-1",
        clientName: "Mila Probna",
        packageName: "",
        sessionValue: 1500,
        isGift: false,
        isTrial: true,
        canConfirmTrial: false,
      },
    ];

    const screen = renderWithQueryClient(<HonorariSessionDetail />);

    await screen.findByTestId("honorari-attendee-consumption-1");
    // One attendee on the card, so the page text IS that line.
    const text = screen.container.textContent ?? "";
    expect(text).toContain("Probni");
    // The package slot names what the value came from — a trial has a value
    // but no package, so the raw empty packageName must not be what shows.
    expect(text).toContain("Probni trening");
    expect(text).toContain("1.500");
    // A confirmed line is done: nothing left to press.
    expect(screen.queryByTestId("confirm-trial-consumption-1")).toBeNull();
  });

  it("posts the confirmation to the booking's confirm-trial endpoint", async () => {
    attendees = [packaged("b-1"), {
      bookingId: "booking-confirmable",
      clientName: "Mila Probna",
      packageName: "",
      sessionValue: null,
      isGift: false,
      isTrial: false,
      canConfirmTrial: true,
    }];

    const screen = renderWithQueryClient(<HonorariSessionDetail />);

    fireEvent.click(await screen.findByTestId("confirm-trial-booking-confirmable"));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]!.path).toBe(
      "/api/bookings/booking-confirmable/confirm-trial",
    );
  });

  it("refetches the month after a confirmation, so the line updates in place", async () => {
    attendees = [
      {
        bookingId: "booking-confirmable",
        clientName: "Mila Probna",
        packageName: "",
        sessionValue: null,
        isGift: false,
        isTrial: false,
        canConfirmTrial: true,
      },
    ];

    const screen = renderWithQueryClient(<HonorariSessionDetail />);
    await screen.findByTestId("confirm-trial-booking-confirmable");

    // The server now hands back the frozen line the POST created.
    attendees = [
      {
        bookingId: "consumption-1",
        clientName: "Mila Probna",
        packageName: "",
        sessionValue: 1500,
        isGift: false,
        isTrial: true,
        canConfirmTrial: false,
      },
    ];
    fireEvent.click(screen.getByTestId("confirm-trial-booking-confirmable"));

    // Observable state, not a spy: the invalidation refetches and the screen
    // re-renders on the confirmed line.
    await screen.findByTestId("honorari-attendee-consumption-1");
    expect(screen.queryByTestId("confirm-trial-booking-confirmable")).toBeNull();
  });

  it("shows a localized message when the confirmation fails", async () => {
    attendees = [
      {
        bookingId: "booking-confirmable",
        clientName: "Mila Probna",
        packageName: "",
        sessionValue: null,
        isGift: false,
        isTrial: false,
        canConfirmTrial: true,
      },
    ];
    postFails = true;

    const screen = renderWithQueryClient(<HonorariSessionDetail />);

    fireEvent.click(await screen.findByTestId("confirm-trial-booking-confirmable"));

    // Raw server English never surfaces under a Serbian UI.
    const error = await screen.findByTestId(
      "confirm-trial-error-booking-confirmable",
    );
    expect(error.textContent).toContain("Potvrda probnog dolaska nije uspela.");
    expect(error.textContent).not.toContain("Booking is backed");
  });
});
