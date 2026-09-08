/**
 * Admin package counts on client detail — Vitest Browser Mode (real Chromium,
 * real RNW, real i18n with the shipped Serbian copy).
 *
 * The card carries one count line: bookable. sessionsRemaining only drops on
 * consumption, so a reserved count printed next to it reads as a contradiction
 * (Rezervisano: 1 beside 12/12). These tests pin the bookable line, the
 * fallback for a payload cached before `bookable` shipped, and the 12/12 trap
 * that returns if someone collapses this back to remaining.
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import "@/lib/i18n";
import { renderWithQueryClient } from "./helpers";
import type { ClientPackage } from "@/lib/queries/packages-queries-factory";

vi.mock("@/lib/api-request", () => ({
  apiRequest: async () => ({ success: true }),
}));

import { PregledTab } from "@/components/admin/client-detail/PregledTab";
import { PaketiTab } from "@/components/admin/client-detail/PaketiTab";

const DAY = 24 * 60 * 60 * 1000;

function makePackage(overrides: Partial<ClientPackage> = {}): ClientPackage {
  return {
    id: "pkg-1",
    clientProfileId: "client-1",
    packageTypeId: "type-1",
    startsAt: new Date(Date.now() - DAY).toISOString(),
    expiresAt: new Date(Date.now() + 30 * DAY).toISOString(),
    sessionsRemaining: 8,
    sessionsTotal: 8,
    packageType: { name: "Reformer 8", sessionCount: 8, validityDays: 60 },
    ...overrides,
  };
}

function renderPregled(activePackage: ClientPackage | null) {
  return renderWithQueryClient(
    <PregledTab
      activePackage={activePackage}
      packagesLoading={false}
      upcomingBookings={[]}
      lang="sr"
      bottomPad={0}
      clientUserId="user-1"
      clientFullName="Marija Marković"
      activePause={null}
      upcomingPause={null}
      onEditPause={() => {}}
    />,
  );
}

// PaketiTab reads only isLoading / isError off the query.
const loadedQuery = { isLoading: false, isError: false } as never;

function renderPaketi(packages: ClientPackage[]) {
  return renderWithQueryClient(
    <PaketiTab
      packagesQuery={loadedQuery}
      allPackages={packages}
      lang="sr"
      bottomPad={0}
    />,
  );
}

describe("admin package counts", () => {
  it("shows one bookable count line on the Trenutni paket card", () => {
    const screen = renderPregled(
      makePackage({ sessionsRemaining: 8, sessionsTotal: 8, heldCount: 2, bookable: 6 }),
    );
    expect(screen.queryByTestId("client-package-held")).toBeNull();
    expect(screen.getByTestId("client-package-bookable").textContent).toContain(
      "Slobodno za zakazivanje: 6/8",
    );
    expect(screen.container.textContent).not.toContain("Rezervisano");
  });

  it("shows bookable, not remaining, when a reservation holds a seat", () => {
    // The trap: sessionsRemaining is untouched until a session is consumed, so
    // this package still reads 12 remaining while one seat is held. Printing
    // 12/12 here is the regression.
    const screen = renderPregled(
      makePackage({
        sessionsRemaining: 12,
        sessionsTotal: 12,
        heldCount: 1,
        bookable: 11,
      }),
    );
    expect(screen.getByTestId("client-package-bookable").textContent).toContain(
      "Slobodno za zakazivanje: 11/12",
    );
    expect(screen.container.textContent).not.toContain("12/12");
  });

  it("keeps the old single line when bookable is missing (payload cached pre-field)", () => {
    const screen = renderPregled(
      makePackage({ sessionsRemaining: 8, sessionsTotal: 8 }),
    );
    expect(screen.queryByTestId("client-package-bookable")).toBeNull();
    expect(screen.container.textContent).toContain("8/8 termina");
  });

  it("adds a bookable line to an active package-history row", () => {
    const screen = renderPaketi([
      makePackage({ sessionsRemaining: 8, sessionsTotal: 8, heldCount: 2, bookable: 6 }),
    ]);
    const line = screen.getByTestId("package-history-row-pkg-1-bookable");
    expect(line.textContent).toContain("Za zakazivanje: 6");
    expect(line.textContent).not.toContain("Rezervisano");
    // The remaining/total line stays — it is the package's own arithmetic.
    expect(screen.container.textContent).toContain("8/8 termina");
  });

  it("omits the bookable line on a revoked row", () => {
    const screen = renderPaketi([
      makePackage({
        heldCount: 2,
        bookable: 6,
        revokedAt: new Date(Date.now() - DAY).toISOString(),
      }),
    ]);
    expect(
      screen.queryByTestId("package-history-row-pkg-1-bookable"),
    ).toBeNull();
  });

  it("omits the bookable line on an expired row", () => {
    const screen = renderPaketi([
      makePackage({
        heldCount: 2,
        bookable: 6,
        expiresAt: new Date(Date.now() - DAY).toISOString(),
      }),
    ]);
    expect(
      screen.queryByTestId("package-history-row-pkg-1-bookable"),
    ).toBeNull();
  });

  it("omits the bookable line when the server sent no bookable", () => {
    const screen = renderPaketi([makePackage()]);
    expect(
      screen.queryByTestId("package-history-row-pkg-1-bookable"),
    ).toBeNull();
  });
});
