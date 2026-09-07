/**
 * Admin package counts on client detail — Vitest Browser Mode (real Chromium,
 * real RNW, real i18n with the shipped Serbian copy).
 *
 * The admin needs to see what is already reserved and what is left on the
 * package. A separate "free to book" line stated the difference of those two
 * numbers and read as a repeat, so the card carries one count line. These
 * tests pin that line, and the fallback for a payload cached before
 * `bookable` shipped.
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
  it("shows one held-plus-remaining count line on the Trenutni paket card", () => {
    const screen = renderPregled(
      makePackage({ sessionsRemaining: 8, sessionsTotal: 8, heldCount: 2, bookable: 6 }),
    );
    expect(screen.queryByTestId("client-package-bookable")).toBeNull();
    expect(screen.getByTestId("client-package-held").textContent).toContain(
      "Rezervisano: 2 · Preostalo na paketu: 8/8",
    );
    expect(screen.container.textContent).not.toContain("Slobodno za zakazivanje");
  });

  it("keeps the old single line when bookable is missing (payload cached pre-field)", () => {
    const screen = renderPregled(
      makePackage({ sessionsRemaining: 8, sessionsTotal: 8 }),
    );
    expect(screen.queryByTestId("client-package-bookable")).toBeNull();
    expect(screen.container.textContent).toContain("8/8 termina");
  });

  it("adds a reserved line to an active package-history row", () => {
    const screen = renderPaketi([
      makePackage({ sessionsRemaining: 8, sessionsTotal: 8, heldCount: 2, bookable: 6 }),
    ]);
    const line = screen.getByTestId("package-history-row-pkg-1-held");
    expect(line.textContent).toContain("Rezervisano: 2");
    expect(line.textContent).not.toContain("Za zakazivanje");
    // The remaining/total line stays — it is the package's own arithmetic.
    expect(screen.container.textContent).toContain("8/8 termina");
  });

  it("omits the reserved line on a revoked row", () => {
    const screen = renderPaketi([
      makePackage({
        heldCount: 2,
        bookable: 6,
        revokedAt: new Date(Date.now() - DAY).toISOString(),
      }),
    ]);
    expect(
      screen.queryByTestId("package-history-row-pkg-1-held"),
    ).toBeNull();
  });

  it("omits the reserved line on an expired row", () => {
    const screen = renderPaketi([
      makePackage({
        heldCount: 2,
        bookable: 6,
        expiresAt: new Date(Date.now() - DAY).toISOString(),
      }),
    ]);
    expect(
      screen.queryByTestId("package-history-row-pkg-1-held"),
    ).toBeNull();
  });

  it("omits the reserved line when the server sent no bookable", () => {
    const screen = renderPaketi([makePackage()]);
    expect(
      screen.queryByTestId("package-history-row-pkg-1-held"),
    ).toBeNull();
  });
});
