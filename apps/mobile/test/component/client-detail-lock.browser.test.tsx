/**
 * Sign-in lock on the admin client-detail header — Vitest Browser Mode
 * (real Chromium, real RNW, real i18n with the shipped Serbian copy).
 *
 * A locked client is NOT a deactivated one (CONTEXT.md → People): they are
 * still a member, they just cannot get past /sign-in until the lock lifts.
 * The admin's job here is to lift it early, so the badge has to state the
 * deadline and the action has to sit right next to it.
 *
 * The interesting branch is "is this lock still live?" — the server only ever
 * sends a future instant or null, but a cached payload can go stale in the
 * app while the lock quietly expires, and a padlock the admin cannot explain
 * is worse than none. `apiRequest` is stubbed at the transport seam so the
 * POST is assertable; the query factory, mutation options and i18n are real.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import "@/lib/i18n";
import { renderWithQueryClient } from "./helpers";
import { nowMs } from "@/lib/now";
import { formatTime } from "@/lib/format-date";

const apiRequestMock = vi.fn(
  async (_path: string, _opts?: Record<string, unknown>) => ({
    success: true,
    user: { id: "user-1", lockedUntil: null },
  }),
);
vi.mock("@/lib/api-request", () => ({
  apiRequest: (path: string, opts?: Record<string, unknown>) =>
    apiRequestMock(path, opts),
}));

import { ClientDetailHeaderCard } from "@/components/admin/client-detail/ClientDetailHeaderCard";

const MINUTE = 60_000;

function makeClient(lockedUntil: string | null | undefined) {
  return {
    user: {
      id: "user-1",
      fullName: "Marija Marković",
      email: "marija@e2e.test",
      phone: null,
      lockedUntil,
    },
    dateOfBirth: null,
    packageStatus: "active" as const,
    activePause: null,
  };
}

function renderCard(lockedUntil: string | null | undefined) {
  return renderWithQueryClient(
    <ClientDetailHeaderCard
      client={makeClient(lockedUntil)}
      onPressPhone={() => {}}
    />,
  );
}

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue({
    success: true,
    user: { id: "user-1", lockedUntil: null },
  });
});

describe("client-detail sign-in lock", () => {
  it("shows neither badge nor unlock action when the client is not locked", () => {
    const screen = renderCard(null);
    expect(screen.queryByTestId("client-detail-locked-badge")).toBeNull();
    expect(screen.queryByTestId("client-detail-unlock-button")).toBeNull();
  });

  it("shows neither when the field is absent from an older cached payload", () => {
    const screen = renderCard(undefined);
    expect(screen.queryByTestId("client-detail-locked-badge")).toBeNull();
    expect(screen.queryByTestId("client-detail-unlock-button")).toBeNull();
  });

  it("shows neither for a lock whose instant has already passed", () => {
    const screen = renderCard(new Date(nowMs() - MINUTE).toISOString());
    expect(screen.queryByTestId("client-detail-locked-badge")).toBeNull();
    expect(screen.queryByTestId("client-detail-unlock-button")).toBeNull();
  });

  it("shows the badge with the shipped Serbian copy and the deadline", () => {
    const until = new Date(nowMs() + 10 * MINUTE).toISOString();
    const screen = renderCard(until);

    const badge = screen.getByTestId("client-detail-locked-badge");
    expect(badge.textContent).toContain("Zaključan do");
    expect(badge.textContent).toContain(formatTime(until, "sr"));
  });

  it("shows the unlock action with its Serbian label", () => {
    const screen = renderCard(new Date(nowMs() + 10 * MINUTE).toISOString());
    expect(
      screen.getByTestId("client-detail-unlock-button").textContent,
    ).toContain("Otključaj");
  });

  it("pressing unlock posts to the unlock endpoint for that user id", async () => {
    const screen = renderCard(new Date(nowMs() + 10 * MINUTE).toISOString());

    fireEvent.click(screen.getByTestId("client-detail-unlock-button"));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledTimes(1));
    expect(apiRequestMock.mock.calls[0][0]).toBe(
      "/api/admin/users/user-1/unlock",
    );
    expect(apiRequestMock.mock.calls[0][1]).toMatchObject({ method: "POST" });
  });

  it("a failed unlock says so instead of failing silently", async () => {
    apiRequestMock.mockRejectedValue(new Error("network down"));
    const screen = renderCard(new Date(nowMs() + 10 * MINUTE).toISOString());

    fireEvent.click(screen.getByTestId("client-detail-unlock-button"));

    await waitFor(() =>
      expect(screen.getByText("Otključavanje nije uspelo.")).toBeTruthy(),
    );
  });
});
