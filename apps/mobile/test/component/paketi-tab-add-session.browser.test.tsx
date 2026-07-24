/**
 * PaketiTab "+1 termin" flow — Vitest Browser Mode (real Chromium, real RNW,
 * real i18n with the shipped Serbian copy).
 *
 * Covers the admin client-detail package card's add-session branch: the action
 * shows only on an active (non-revoked, non-expired) package, and confirming
 * fires the add-session mutation with the package id. The server-side guards
 * (404 / 409 revoked+expired / role) are covered by the integration suite.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import "@/lib/i18n";
import { renderWithQueryClient } from "./helpers";
import type { ClientPackage } from "@/lib/queries/packages-queries-factory";

const apiRequestMock = vi.fn(
  async (_path: string, _opts?: Record<string, unknown>) => ({
    success: true,
    clientPackage: { id: "pkg-1", sessionsRemaining: 4 },
  }),
);
vi.mock("@/lib/api-request", () => ({
  apiRequest: (path: string, opts?: Record<string, unknown>) =>
    apiRequestMock(path, opts),
}));

import { PaketiTab } from "@/components/admin/client-detail/PaketiTab";

const DAY = 24 * 60 * 60 * 1000;

function makePackage(overrides: Partial<ClientPackage> = {}): ClientPackage {
  return {
    id: "pkg-1",
    clientProfileId: "client-1",
    packageTypeId: "type-1",
    startsAt: new Date(Date.now() - DAY).toISOString(),
    expiresAt: new Date(Date.now() + 30 * DAY).toISOString(),
    sessionsRemaining: 3,
    packageType: { name: "Reformer 8", sessionCount: 8, validityDays: 60 },
    ...overrides,
  };
}

// PaketiTab types packagesQuery as a useQuery result but only reads isLoading /
// isError — a loaded stub is enough for these branch tests.
const loadedQuery = { isLoading: false, isError: false } as never;

function renderTab(packages: ClientPackage[]) {
  return renderWithQueryClient(
    <PaketiTab
      packagesQuery={loadedQuery}
      allPackages={packages}
      lang="sr"
      bottomPad={0}
    />,
  );
}

beforeEach(() => {
  apiRequestMock.mockClear();
});

describe("PaketiTab +1 termin", () => {
  it("shows the action with its Serbian label on an active package", () => {
    const screen = renderTab([makePackage()]);
    const action = screen.getByTestId("package-history-row-pkg-1-add-session");
    expect(action.textContent).toContain("+1 termin");
  });

  it("hides the action on a revoked package", () => {
    const screen = renderTab([
      makePackage({ revokedAt: new Date(Date.now() - DAY).toISOString() }),
    ]);
    expect(
      screen.queryByTestId("package-history-row-pkg-1-add-session"),
    ).toBeNull();
  });

  it("hides the action on an expired package", () => {
    const screen = renderTab([
      makePackage({ expiresAt: new Date(Date.now() - DAY).toISOString() }),
    ]);
    expect(
      screen.queryByTestId("package-history-row-pkg-1-add-session"),
    ).toBeNull();
  });

  it("confirming fires the add-session mutation against the package's route", async () => {
    const screen = renderTab([makePackage()]);

    fireEvent.click(screen.getByTestId("package-history-row-pkg-1-add-session"));
    // Confirm sheet copy is the shipped Serbian.
    expect(screen.getByText("Dodati termin?")).toBeTruthy();
    expect(apiRequestMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("package-add-session-confirm-button"));
    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledTimes(1));
    expect(apiRequestMock.mock.calls[0][0]).toBe(
      "/api/packages/client-packages/pkg-1/add-session",
    );
    expect(apiRequestMock.mock.calls[0][1]).toMatchObject({ method: "POST" });
  });
});
