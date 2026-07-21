/**
 * Katalog landing screen behavior tests.
 *
 * The landing splits "Kreiraj" (hero row → opens NewSessionSheet) and
 * "Katalog" (four navigation rows). Presses are real: the hero flips local
 * state and mounts the sheet; the rows navigate via the expo-router stub's
 * call log. NewSessionSheet itself is a heavy form with its own queries —
 * mocked here to a marker; its behavior belongs to its own tests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent } from "@testing-library/react";
import React from "react";
import "@/lib/i18n";
import { routerCalls } from "expo-router";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import { renderWithQueryClient } from "./helpers";

vi.mock("@/components/admin/new-session-sheet", () => ({
  NewSessionSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="new-session-sheet-mounted" /> : null,
}));

import KatalogIndex from "@/app/(admin)/katalog/index";

beforeEach(() => {
  routerCalls.length = 0;
});

function renderScreen() {
  // The header's UserAvatar reads authQueries.me() — seed it so the screen
  // renders as a signed-in admin without touching the network.
  return renderWithQueryClient(<KatalogIndex />, (client) => {
    client.setQueryData(authQueries.me().queryKey, {
      user: {
        id: "admin-1",
        email: "admin@test.local",
        role: "ADMIN",
        isActive: true,
        clientProfile: null,
      },
    });
  });
}

describe("Katalog landing screen", () => {
  it("renders both section labels in Serbian", () => {
    // The AppHeader shows the logo lockup, not a title string, so "Katalog"
    // appears exactly once — as the section caps label. (The old static-
    // markup test asserted a mocked header that rendered the title as text.)
    const screen = renderScreen();
    expect(screen.getByText("Katalog")).toBeTruthy();
    expect(screen.getByText("Kreiraj")).toBeTruthy();
  });

  it("pressing the Novi termin hero opens the create sheet", () => {
    const screen = renderScreen();
    expect(screen.queryByTestId("new-session-sheet-mounted")).toBeNull();

    fireEvent.click(screen.getByTestId("katalog-novi-termin"));
    expect(screen.getByTestId("new-session-sheet-mounted")).toBeTruthy();
  });

  it.each([
    ["katalog-row-class-types", "/(admin)/katalog/tipovi-treninga"],
    ["katalog-row-rooms", "/(admin)/katalog/sale"],
    ["katalog-row-package-types", "/(admin)/katalog/tipovi-paketa"],
    ["katalog-row-campaigns", "/(admin)/katalog/kampanje"],
  ])("pressing %s navigates to %s", (testID, href) => {
    const screen = renderScreen();

    fireEvent.click(screen.getByTestId(testID));
    expect(routerCalls).toEqual([{ method: "push", args: [href] }]);
  });
});
