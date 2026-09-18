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
// Same module instance the components get via the "expo-router" alias, but
// imported by path so the real expo-router types don't reject `routerCalls`.
import { routerCalls } from "./stubs/expo-router";
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
      success: true,
      user: {
        id: "admin-1",
        email: "admin@test.local",
        firstName: "Admin",
        lastName: "Test",
        fullName: "Admin Test",
        role: "ADMIN" as const,
        isActive: true,
        createdAt: new Date(),
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

/**
 * Package-type row: the 🎂 badge must stay inside the row.
 *
 * "Rođendanski paket (energy)" is longer than the row is wide, and the name
 * Text had numberOfLines={1} but no shrink priority — so instead of
 * ellipsizing it kept its full intrinsic width and shoved the Badge out past
 * the card's right edge. The name is the yielding element here; the badge is
 * what tells an admin this SKU is the birthday gift, so it holds its width.
 */
import { packagesQueries } from "@/lib/queries/packages-queries-factory";
import { trainingsQueries } from "@/lib/queries/trainings-queries-factory";
import TipoviPaketa from "@/app/(admin)/katalog/tipovi-paketa";
import { View } from "react-native";

const LONG_BIRTHDAY_NAME = "Rođendanski paket (energy)";

function renderPackageTypes() {
  return renderWithQueryClient(
    // A real phone width, so the name and the badge compete for the row the
    // way they do on device.
    <View style={{ width: 390 }}>
      <TipoviPaketa />
    </View>,
    (client) => {
      client.setQueryData(authQueries.me().queryKey, {
        success: true,
        user: {
          id: "admin-1",
          email: "admin@test.local",
          firstName: "Admin",
          lastName: "Test",
          fullName: "Admin Test",
          role: "ADMIN" as const,
          isActive: true,
          createdAt: new Date(),
          clientProfile: null,
        },
      });
      client.setQueryData(trainingsQueries.classTypes().queryKey, {
        success: true,
        classTypes: [
          {
            id: "ct1",
            name: "Energy",
            maxClients: 8,
            durationMins: 50,
            trialSessionValue: null,
          },
        ],
      });
      client.setQueryData(packagesQueries.types().queryKey, {
        success: true,
        packageTypes: [
          {
            id: "pt-birthday",
            name: LONG_BIRTHDAY_NAME,
            sessionCount: 1,
            validityDays: 30,
            lateCancelHours: 8,
            price: null,
            classTypes: [{ id: "ct1", name: "Energy" }],
            isBirthdayGift: true,
          },
        ],
      });
    },
  );
}

describe("package-type row with a long birthday SKU name", () => {
  it("renders the name and the birthday badge", () => {
    const screen = renderPackageTypes();

    expect(screen.getByText(LONG_BIRTHDAY_NAME)).toBeTruthy();
    expect(
      screen.getByTestId("package-type-birthday-badge-pt-birthday"),
    ).toBeTruthy();
  });

  it("gives the name the shrink priority and pins the badge", () => {
    // What this layer can and cannot assert: react-native-web already gives a
    // Text with numberOfLines={1} `flex-shrink: 1; overflow: hidden`, so the
    // browser never reproduces the overflow — Yoga on native has no such
    // default and lets the name keep its full intrinsic width, which is what
    // pushed the badge off the card. The inline styles carrying the shrink
    // priority ARE real here, so that contract is what this locks (same
    // approach as long-class-type-name's day-view specs).
    const screen = renderPackageTypes();

    const name = screen.getByTestId("package-type-name-pt-birthday");
    // minWidth 0 is the load-bearing half: without it a flex item's min-width
    // is its content and it refuses to shrink at all.
    expect(name.style.flexShrink).toBe("1");
    expect(name.style.minWidth).toBe("0px");

    const badge = screen.getByTestId("package-type-birthday-badge-pt-birthday");
    expect(badge.style.flexShrink).toBe("0");
  });
});
