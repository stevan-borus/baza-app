/**
 * Izveštaji landing behavior tests.
 *
 * The landing is a 4-card hub over a calendar-aligned period pill. Data
 * comes from seeded reportsQueries caches computed with the SAME pure
 * window math the screen uses (computePeriodWindow), so the queryKeys
 * match without mocking the query layer. Pins the round-9 decisions:
 * no "Nedelja" segment, numerals-as-hero cards with a chevron cue and
 * no top-right icon, square tiles.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { fireEvent } from "@testing-library/react";
import React from "react";
import "@/lib/i18n";
// Imported by path so the real expo-router types don't reject `routerCalls`;
// same module instance the screen sees through the alias.
import { routerCalls } from "./stubs/expo-router";
import { reportsQueries } from "@/lib/queries/reports-queries-factory";
import { computePeriodWindow } from "@/lib/admin/use-period-pill";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import { renderWithQueryClient } from "./helpers";
import IzvestajiLanding from "@/app/(admin)/izvestaji/index";

beforeEach(() => {
  routerCalls.length = 0;
});

function renderScreen() {
  const window = computePeriodWindow("month", new Date());
  return renderWithQueryClient(<IzvestajiLanding />, (client) => {
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
    client.setQueryData(reportsQueries.summary(window).queryKey, {
      success: true,
      summary: {
        totalClients: 20,
        activeClients: 17,
        inactiveClients: 3,
        totalSessions: 42,
        revenue: 125000,
        totalPayments: 30,
      },
    });
    client.setQueryData(
      reportsQueries.utilization({ ...window, period: "month" }).queryKey,
      {
        success: true,
        data: [
          { period: "2026-07", totalCapacity: 100, totalBooked: 50, utilization: 0.5 },
          { period: "2026-08", totalCapacity: 100, totalBooked: 70, utilization: 0.7 },
        ],
      },
    );
  });
}

describe("Izveštaji landing — period selector", () => {
  it("renders Mesec/Kvartal/Godina/Sve and no Nedelja segment", () => {
    const screen = renderScreen();
    for (const label of ["Mesec", "Kvartal", "Godina", "Sve"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.queryByText("Nedelja")).toBeNull();
  });
});

describe("Izveštaji landing — card grid", () => {
  it("renders the four cards with seeded headline numbers", () => {
    const screen = renderScreen();
    // Revenue formatted sr-RS; utilization averaged (0.5+0.7)/2 → 60%.
    expect(
      screen.getByTestId("izvestaji-card-prihod").textContent,
    ).toContain("125.000");
    expect(
      screen.getByTestId("izvestaji-card-iskoriscenost").textContent,
    ).toContain("60");
    expect(
      screen.getByTestId("izvestaji-card-rezervacije").textContent,
    ).toContain("42");
    expect(
      screen.getByTestId("izvestaji-card-paketi").textContent,
    ).toContain("17");
  });

  it("keeps each card square (aspect-ratio 1) with a chevron cue and no top-right icon", () => {
    const screen = renderScreen();
    const cards = [
      "izvestaji-card-prihod",
      "izvestaji-card-iskoriscenost",
      "izvestaji-card-rezervacije",
      "izvestaji-card-paketi",
    ].map((id) => screen.getByTestId(id));

    for (const card of cards) {
      expect(getComputedStyle(card).aspectRatio.startsWith("1")).toBe(true);
      // Round-9 feedback: tiles didn't read as tappable without a chevron.
      expect(card.querySelector('[data-testid="lucide-ChevronRight"]')).toBeTruthy();
      // The duplicate top-right affordance stays dropped.
      expect(card.querySelector('[data-testid="lucide-BarChart3"]')).toBeNull();
      expect(card.querySelector('[data-testid="lucide-Calendar"]')).toBeNull();
      expect(card.querySelector('[data-testid="lucide-Package"]')).toBeNull();
    }
  });

  it("pressing a card navigates to its sub-page", () => {
    const screen = renderScreen();

    fireEvent.click(screen.getByTestId("izvestaji-card-prihod"));
    expect(routerCalls).toEqual([
      { method: "push", args: ["/(admin)/izvestaji/prihod"] },
    ]);
  });
});
