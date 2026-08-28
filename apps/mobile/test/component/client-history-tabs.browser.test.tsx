/**
 * "Prošli treninzi" — the Održani / Otkazani split.
 *
 * The studio asked for two tabs and for the cancelled one to hide free
 * cancellations. That filter lives on the server (`outcome=`), so what this
 * layer pins is the wiring: the screen opens on Održani, switching tabs
 * refetches under a DIFFERENT cache key (otherwise the two tabs would share
 * one list), and each tab tells the client something true when it's empty.
 */
import { describe, it, expect } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/lib/i18n";
import ClientTrainingHistory from "@/app/(client)/profile/history";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import { bookingsQueries } from "@/lib/queries/bookings-queries-factory";
import type { ClientBooking } from "@/lib/queries/bookings-queries-factory";

const USER_ID = "user-1";

function booking(overrides: Partial<ClientBooking> = {}): ClientBooking {
  return {
    id: "b-attended",
    status: "CONFIRMED",
    bookedAt: "2026-06-01T10:00:00.000Z",
    canceledAt: null,
    session: {
      id: "s1",
      startsAt: "2026-06-10T10:00:00.000Z",
      endsAt: "2026-06-10T11:00:00.000Z",
      classType: { id: "ct1", name: "Reformer pilates" },
      room: { id: "r1", name: "Sala 1" },
      trainer: { id: "t1", fullName: "Trainer T" },
    },
    ...overrides,
  };
}

const canceledBooking = booking({
  id: "b-canceled",
  status: "CANCELED",
  canceledAt: "2026-06-09T14:30:00.000Z",
  consumedSession: true,
  session: {
    id: "s2",
    startsAt: "2026-06-09T18:00:00.000Z",
    endsAt: "2026-06-09T19:00:00.000Z",
    classType: { id: "ct1", name: "Energy pilates" },
    room: { id: "r1", name: "Sala 1" },
    trainer: { id: "t1", fullName: "Trainer T" },
  },
});

function seededClient(seed: {
  attended?: ClientBooking[];
  canceled?: ClientBooking[];
}) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  client.setQueryData(authQueries.me().queryKey, {
    success: true,
    user: {
      id: USER_ID,
      email: "c@test.local",
      firstName: "Ana",
      lastName: "Petrović",
      fullName: "Ana Petrović",
      role: "CLIENT" as const,
      isActive: true,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      clientProfile: { id: "cp-1" },
    },
  });
  for (const outcome of ["attended", "canceled"] as const) {
    const bookings = seed[outcome] ?? [];
    client.setQueryData(
      bookingsQueries.byClient({
        clientUserId: USER_ID,
        period: "past",
        outcome,
        limit: 20,
      }).queryKey,
      { pages: [{ success: true, bookings, nextCursor: null }], pageParams: [null] },
    );
  }
  return client;
}

function renderHistory(seed: Parameters<typeof seededClient>[0]) {
  const client = seededClient(seed);
  return render(
    <QueryClientProvider client={client}>
      <ClientTrainingHistory />
    </QueryClientProvider>,
  );
}

describe("client training history tabs", () => {
  it("opens on Održani and shows attended sessions", async () => {
    const screen = renderHistory({
      attended: [booking()],
      canceled: [canceledBooking],
    });
    await waitFor(() => {
      expect(screen.getByTestId("booking-row-b-attended")).toBeTruthy();
    });
    // The cancelled one belongs to the other tab, not this list.
    expect(screen.queryByTestId("booking-row-b-canceled")).toBeNull();
  });

  it("switching to Otkazani swaps the list, so the tabs are not one query", async () => {
    const screen = renderHistory({
      attended: [booking()],
      canceled: [canceledBooking],
    });
    await waitFor(() => {
      expect(screen.getByTestId("booking-row-b-attended")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("client-history-tab-canceled"));

    await waitFor(() => {
      expect(screen.getByTestId("booking-row-b-canceled")).toBeTruthy();
    });
    expect(screen.queryByTestId("booking-row-b-attended")).toBeNull();
  });

  it("shows the cancellation timestamp on the Otkazani rows", async () => {
    const screen = renderHistory({ canceled: [canceledBooking] });
    fireEvent.click(screen.getByTestId("client-history-tab-canceled"));
    await waitFor(() => {
      expect(screen.getByTestId("booking-row-canceled-at")).toBeTruthy();
    });
    expect(screen.getByTestId("booking-row-canceled-at").textContent).toContain(
      "Otkazano",
    );
  });

  it("each empty tab explains its own emptiness", async () => {
    const screen = renderHistory({});
    await waitFor(() => {
      expect(screen.getByText("Još nema održanih treninga.")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("client-history-tab-canceled"));

    await waitFor(() => {
      // Not "no cancellations" — free cancels are hidden on purpose, so the
      // copy has to say what the tab actually holds.
      expect(
        screen.getByText("Nema otkazanih termina."),
      ).toBeTruthy();
    });
  });
});
