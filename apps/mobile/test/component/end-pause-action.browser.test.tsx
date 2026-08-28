/**
 * End-pause action on the admin client-detail screen — Vitest Browser Mode
 * (real Chromium, real RNW, real i18n with the shipped Serbian copy).
 *
 * Ending a pause is not a neutral undo: it pulls every package's expiry back
 * by the unused remainder of the window, and it does NOT re-book the
 * reservations the pause cancelled. Both surprise admins, so the action is
 * gated behind a confirm sheet that says so out loud. These tests pin the
 * gate (absent when the client isn't paused), the confirm step (a press
 * opens the sheet, it does not mutate), and the failure path (sheet stays
 * open, error shown) — the server-side arithmetic is the integration suite's.
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

import { ClientDetailHeaderCard } from "@/components/admin/client-detail/ClientDetailHeaderCard";

const DAY = 24 * 60 * 60 * 1000;

const ACTIVE_PAUSE = {
  id: "pause-1",
  startsAt: new Date(Date.now() - DAY).toISOString(),
  endsAt: new Date(Date.now() + 20 * DAY).toISOString(),
};

function makeClient(
  overrides: {
    packageStatus?: "active" | "expiring" | "paused" | "expired" | "none";
    activePause?: typeof ACTIVE_PAUSE | null;
  } = {},
) {
  return {
    user: {
      fullName: "Marija Marković",
      email: "marija@e2e.test",
      phone: null,
    },
    dateOfBirth: null,
    packageStatus: overrides.packageStatus ?? "paused",
    activePause:
      overrides.activePause === undefined ? ACTIVE_PAUSE : overrides.activePause,
  };
}

function renderCard(client: ReturnType<typeof makeClient>) {
  return renderWithQueryClient(
    <ClientDetailHeaderCard client={client} onPressPhone={() => {}} />,
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
  it("is absent when the client is not paused", () => {
    const screen = renderCard(
      makeClient({ packageStatus: "active", activePause: null }),
    );
    expect(screen.queryByTestId("client-end-pause-button")).toBeNull();
  });

  it("is absent when the status says paused but no pause row came back", () => {
    // Defensive: an older cached payload has no activePause. Without an id
    // there is nothing to end, so the action must not offer itself.
    const screen = renderCard(
      makeClient({ packageStatus: "paused", activePause: null }),
    );
    expect(screen.queryByTestId("client-end-pause-button")).toBeNull();
  });

  it("is present with its Serbian label when the client is paused", () => {
    const screen = renderCard(makeClient());
    expect(screen.getByTestId("client-end-pause-button").textContent).toContain(
      "Prekini pauzu",
    );
  });

  it("pressing it opens the confirm sheet instead of mutating", () => {
    const screen = renderCard(makeClient());

    fireEvent.click(screen.getByTestId("client-end-pause-button"));

    expect(screen.getByText("Prekini pauzu?")).toBeTruthy();
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("the confirm copy warns about the shortened expiry AND the unrestored reservations", () => {
    const screen = renderCard(makeClient());
    fireEvent.click(screen.getByTestId("client-end-pause-button"));

    const sheet = screen.container.textContent ?? "";
    // Expiry moves back by the unused remainder.
    expect(sheet).toContain("skraćuje");
    // Cancelled reservations are NOT restored.
    expect(sheet).toContain("neće biti vraćene");
  });

  it("confirming calls the end-pause endpoint for that pause id", async () => {
    const screen = renderCard(makeClient());

    fireEvent.click(screen.getByTestId("client-end-pause-button"));
    fireEvent.click(screen.getByTestId("client-end-pause-confirm-button"));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledTimes(1));
    expect(apiRequestMock.mock.calls[0][0]).toBe(
      "/api/packages/pauses/pause-1/end",
    );
    expect(apiRequestMock.mock.calls[0][1]).toMatchObject({ method: "POST" });
  });

  it("closes the confirm sheet only after the mutation succeeds", async () => {
    const screen = renderCard(makeClient());

    fireEvent.click(screen.getByTestId("client-end-pause-button"));
    fireEvent.click(screen.getByTestId("client-end-pause-confirm-button"));

    await waitFor(() =>
      expect(screen.queryByTestId("client-end-pause-confirm-button")).toBeNull(),
    );
  });

  it("a failed end keeps the sheet open and shows the error", async () => {
    apiRequestMock.mockRejectedValue(new Error("network down"));
    const screen = renderCard(makeClient());

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
    const screen = renderCard(makeClient());

    fireEvent.click(screen.getByTestId("client-end-pause-button"));
    fireEvent.click(screen.getByTestId("client-end-pause-confirm-button"));

    await waitFor(() =>
      expect(screen.getByText("Ova pauza je već završena.")).toBeTruthy(),
    );
  });
});
