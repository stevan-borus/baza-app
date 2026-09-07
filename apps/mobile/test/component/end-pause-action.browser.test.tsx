/**
 * End-pause action on the admin client-detail screen — Vitest Browser Mode
 * (real Chromium, real RNW, real i18n with the shipped Serbian copy).
 *
 * Ending a pause is not a neutral undo: it pulls every package's expiry back
 * by the unused remainder of the window, and it does NOT re-book the
 * reservations the pause cancelled. Both surprise admins, so the action is
 * gated behind a confirm sheet that says so out loud. These tests pin the
 * gate (absent when there is no pause), the confirm step (a press opens the
 * sheet, it does not mutate), and the failure path (sheet stays open, error
 * shown) — the server-side arithmetic is the integration suite's.
 *
 * The action moved off the header card and onto PauseCard on the Pregled tab:
 * a bare text link next to the status chip had no room to say WHICH window it
 * was ending. The header now shows only the chip, which the last test pins.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import "@/lib/i18n";
import { renderWithQueryClient } from "./helpers";
import { ApiError } from "@/lib/api-error";

const apiRequestMock = vi.fn(
  async (_path: string, _opts?: Record<string, unknown>) => ({
    success: true,
    pause: { id: "pause-1", endsAt: new Date().toISOString() },
  }),
);
vi.mock("@/lib/api-request", () => ({
  apiRequest: (path: string, opts?: Record<string, unknown>) =>
    apiRequestMock(path, opts),
}));

import { PauseCard } from "@/components/admin/client-detail/PauseCard";
import { ClientDetailHeaderCard } from "@/components/admin/client-detail/ClientDetailHeaderCard";
import { PregledTab } from "@/components/admin/client-detail/PregledTab";

const DAY = 24 * 60 * 60 * 1000;

const ACTIVE_PAUSE = {
  id: "pause-1",
  startsAt: new Date(Date.now() - DAY).toISOString(),
  endsAt: new Date(Date.now() + 20 * DAY).toISOString(),
  reason: null as string | null,
};

function renderCard(
  pause: typeof ACTIVE_PAUSE = ACTIVE_PAUSE,
  kind: "active" | "upcoming" = "active",
) {
  return renderWithQueryClient(
    <PauseCard pause={pause} kind={kind} lang="sr" onEditPause={() => {}} />,
  );
}

function renderPregled(pauses: {
  activePause: typeof ACTIVE_PAUSE | null;
  upcomingPause?: typeof ACTIVE_PAUSE | null;
}) {
  return renderWithQueryClient(
    <PregledTab
      activePackage={null}
      packagesLoading={false}
      upcomingBookings={[]}
      lang="sr"
      bottomPad={0}
      clientUserId="user-1"
      clientFullName="Marija Marković"
      activePause={pauses.activePause}
      upcomingPause={pauses.upcomingPause}
      onEditPause={() => {}}
    />,
  );
}

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue({
    success: true,
    pause: { id: "pause-1", endsAt: new Date().toISOString() },
  });
});

describe("client-detail end-pause action", () => {
  it("is absent from the header card, which now shows only the status pill", () => {
    // Even for a paused client: the action lives on the Pregled tab's
    // PauseCard, where there is room to name the window it ends.
    const screen = renderWithQueryClient(
      <ClientDetailHeaderCard
        client={{
          user: {
            fullName: "Marija Marković",
            email: "marija@e2e.test",
            phone: null,
          },
          dateOfBirth: null,
          packageStatus: "paused",
        }}
        onPressPhone={() => {}}
      />,
    );
    expect(screen.queryByTestId("client-end-pause-button")).toBeNull();
    expect(screen.container.textContent).toContain("Pauziran");
  });

  it("is absent on the Pregled tab when the client has no pause at all", () => {
    const screen = renderPregled({ activePause: null, upcomingPause: null });
    expect(screen.queryByTestId("client-end-pause-button")).toBeNull();
    expect(screen.queryByTestId("client-pause-range")).toBeNull();
  });

  it("is absent when a stale payload carries no pause row to end", () => {
    // Defensive: a payload cached before the field shipped has no pause. With
    // no id there is nothing to end, so no card and no action.
    const screen = renderPregled({ activePause: null, upcomingPause: undefined });
    expect(screen.queryByTestId("client-end-pause-button")).toBeNull();
  });

  it("prefers the running pause when a scheduled one also exists", () => {
    const screen = renderPregled({
      activePause: ACTIVE_PAUSE,
      upcomingPause: {
        id: "pause-2",
        startsAt: new Date(Date.now() + 40 * DAY).toISOString(),
        endsAt: new Date(Date.now() + 50 * DAY).toISOString(),
        reason: null,
      },
    });
    expect(screen.getByTestId("client-end-pause-button").textContent).toContain(
      "Prekini pauzu",
    );
  });

  it("is present with its Serbian label when the client is paused", () => {
    const screen = renderCard();
    expect(screen.getByTestId("client-end-pause-button").textContent).toContain(
      "Prekini pauzu",
    );
  });

  it("pressing it opens the confirm sheet instead of mutating", () => {
    const screen = renderCard();

    fireEvent.click(screen.getByTestId("client-end-pause-button"));

    expect(screen.getByText("Prekini pauzu?")).toBeTruthy();
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("the confirm copy warns about the shortened expiry AND the unrestored reservations", () => {
    const screen = renderCard();
    fireEvent.click(screen.getByTestId("client-end-pause-button"));

    const sheet = screen.container.textContent ?? "";
    // Expiry moves back by the unused remainder.
    expect(sheet).toContain("skraćuje");
    // Cancelled reservations are NOT restored.
    expect(sheet).toContain("neće biti vraćene");
  });

  it("confirming calls the end-pause endpoint for that pause id", async () => {
    const screen = renderCard();

    fireEvent.click(screen.getByTestId("client-end-pause-button"));
    fireEvent.click(screen.getByTestId("client-end-pause-confirm-button"));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledTimes(1));
    expect(apiRequestMock.mock.calls[0][0]).toBe(
      "/api/packages/pauses/pause-1/end",
    );
    expect(apiRequestMock.mock.calls[0][1]).toMatchObject({ method: "POST" });
  });

  it("closes the confirm sheet only after the mutation succeeds", async () => {
    const screen = renderCard();

    fireEvent.click(screen.getByTestId("client-end-pause-button"));
    fireEvent.click(screen.getByTestId("client-end-pause-confirm-button"));

    await waitFor(() =>
      expect(screen.queryByTestId("client-end-pause-confirm-button")).toBeNull(),
    );
  });

  it("a failed end keeps the sheet open and shows the error", async () => {
    apiRequestMock.mockRejectedValue(new Error("network down"));
    const screen = renderCard();

    fireEvent.click(screen.getByTestId("client-end-pause-button"));
    fireEvent.click(screen.getByTestId("client-end-pause-confirm-button"));

    await waitFor(() =>
      expect(screen.getByText("Prekid pauze nije uspeo. Pokušaj ponovo.")).toBeTruthy(),
    );
    // Still open — a silent dismiss would read as "it worked".
    expect(screen.getByTestId("client-end-pause-confirm-button")).toBeTruthy();
  });

  it("a 409 says the pause already finished instead of the generic failure", async () => {
    apiRequestMock.mockRejectedValue(
      new ApiError(409, { error: "Pause has already finished" }, "fallback"),
    );
    const screen = renderCard();

    fireEvent.click(screen.getByTestId("client-end-pause-button"));
    fireEvent.click(screen.getByTestId("client-end-pause-confirm-button"));

    await waitFor(() =>
      expect(screen.getByText("Ova pauza je već završena.")).toBeTruthy(),
    );
  });
});
