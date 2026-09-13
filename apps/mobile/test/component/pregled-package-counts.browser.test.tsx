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
import dayjs from "dayjs";
import React from "react";
import "@/lib/i18n";
import { renderWithQueryClient } from "./helpers";
import type { ClientPackage } from "@/lib/queries/packages-queries-factory";

vi.mock("@/lib/api-request", () => ({
  apiRequest: async () => ({ success: true }),
}));

import { PregledTab } from "@/components/admin/client-detail/PregledTab";
import { activePackages } from "@/components/admin/client-detail";
import { upcomingClientPackages } from "@/lib/package-fully-booked";
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

// Packages go through the SAME filter the screen uses, so a card that should
// have been dropped (not started, expired, revoked) fails here too.
function renderPregled(active: ClientPackage | ClientPackage[] | null) {
  const all = active === null ? [] : Array.isArray(active) ? active : [active];
  return renderWithQueryClient(
    <PregledTab
      activePackages={activePackages(all)}
      upcomingPackages={upcomingClientPackages(all, new Date())}
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

describe("Trenutni paketi — every active package, none that has not started", () => {
  it("renders a card per active package and pluralizes the label", () => {
    // The reported bug: an admin saw one package on this card while the
    // client's own screen listed three. The card must agree with the client.
    const screen = renderPregled([
      makePackage({
        id: "pkg-reformer",
        sessionsRemaining: 12,
        sessionsTotal: 12,
        heldCount: 1,
        bookable: 11,
        packageType: { name: "Reformer 12", sessionCount: 12, validityDays: 60 },
      }),
      makePackage({
        id: "pkg-strongher",
        expiresAt: new Date(Date.now() + 40 * DAY).toISOString(),
        heldCount: 0,
        bookable: 8,
        packageType: { name: "StrongHer", sessionCount: 8, validityDays: 60 },
      }),
    ]);
    expect(screen.container.textContent).toContain("Trenutni paketi");
    expect(screen.container.textContent).toContain("Reformer 12");
    expect(screen.container.textContent).toContain("StrongHer");
    expect(
      screen.getByTestId("client-package-bookable-pkg-reformer").textContent,
    ).toContain("Slobodno za zakazivanje: 11/12");
    expect(
      screen.getByTestId("client-package-bookable-pkg-strongher").textContent,
    ).toContain("Slobodno za zakazivanje: 8/8");
  });

  it("keeps the singular label and the bare testID for a lone package", () => {
    const screen = renderPregled([
      makePackage({ sessionsRemaining: 8, sessionsTotal: 8, heldCount: 2, bookable: 6 }),
    ]);
    expect(screen.container.textContent).toContain("Trenutni paket");
    expect(screen.container.textContent).not.toContain("Trenutni paketi");
    expect(screen.getByTestId("client-package-bookable").textContent).toContain(
      "Slobodno za zakazivanje: 6/8",
    );
  });

  it("keeps a package whose startsAt is still in the future OUT of the current cards", () => {
    const screen = renderPregled([
      makePackage({
        id: "pkg-started",
        packageType: { name: "Reformer 12", sessionCount: 12, validityDays: 60 },
      }),
      makePackage({
        id: "pkg-future",
        startsAt: new Date(Date.now() + 30 * DAY).toISOString(),
        expiresAt: new Date(Date.now() + 90 * DAY).toISOString(),
        packageType: { name: "Decembarski paket", sessionCount: 8, validityDays: 60 },
      }),
    ]);
    expect(screen.container.textContent).toContain("Reformer 12");
    // Singular label: the current-packages section still counts ONE package.
    expect(screen.container.textContent).toContain("Trenutni paket");
    expect(screen.container.textContent).not.toContain("Trenutni paketi");
    // ...but it is no longer invisible — it moved to its own section.
    expect(screen.getByTestId("client-upcoming-package-pkg-future")).toBeTruthy();
  });

  it("shows the empty state AND the upcoming section when the only package has not started", () => {
    // The reported bug: the studio assigned a second Nadoknada starting in five
    // days and nobody could see it existed. The current-package empty state is
    // still correct (nothing is bookable today) — but the package must show.
    const screen = renderPregled([
      makePackage({
        id: "pkg-future",
        startsAt: new Date(Date.now() + 30 * DAY).toISOString(),
        expiresAt: new Date(Date.now() + 90 * DAY).toISOString(),
        packageType: { name: "Decembarski paket", sessionCount: 8, validityDays: 60 },
      }),
    ]);
    expect(screen.container.textContent).toContain("Nema aktivnog paketa.");
    expect(screen.container.textContent).toContain("Decembarski paket");
  });

  it("orders the cards by soonest expiry — that is the one to spend first", () => {
    const screen = renderPregled([
      makePackage({
        id: "pkg-later",
        expiresAt: new Date(Date.now() + 60 * DAY).toISOString(),
        packageType: { name: "Kasniji paket", sessionCount: 8, validityDays: 60 },
      }),
      makePackage({
        id: "pkg-sooner",
        expiresAt: new Date(Date.now() + 5 * DAY).toISOString(),
        packageType: { name: "Raniji paket", sessionCount: 8, validityDays: 60 },
      }),
    ]);
    const text = screen.container.textContent ?? "";
    expect(text.indexOf("Raniji paket")).toBeGreaterThan(-1);
    expect(text.indexOf("Raniji paket")).toBeLessThan(text.indexOf("Kasniji paket"));
  });
});

describe("Uskoro dostupni paketi — a future-dated package is visible, not bookable", () => {
  it("renders the upcoming package with its start date", () => {
    const startsAt = new Date(Date.now() + 5 * DAY);
    const screen = renderPregled([
      makePackage({
        id: "pkg-nadoknada-2",
        startsAt: startsAt.toISOString(),
        expiresAt: new Date(Date.now() + 40 * DAY).toISOString(),
        sessionsRemaining: 1,
        sessionsTotal: 1,
        packageType: { name: "Nadoknada", sessionCount: 1, validityDays: 30 },
      }),
    ]);
    const card = screen.getByTestId("client-upcoming-package-pkg-nadoknada-2");
    expect(card.textContent).toContain("Nadoknada");
    expect(screen.container.textContent).toContain("Uskoro dostupan paket");
    expect(card.textContent).toContain(
      `Dostupan od ${dayjs(startsAt).format("D.M.YYYY.")}`,
    );
  });

  it("marks the upcoming card so it cannot be read as bookable", () => {
    const screen = renderPregled([
      makePackage({
        id: "pkg-active",
        packageType: { name: "Reformer 12", sessionCount: 12, validityDays: 60 },
        heldCount: 0,
        bookable: 8,
      }),
      makePackage({
        id: "pkg-future",
        startsAt: new Date(Date.now() + 5 * DAY).toISOString(),
        expiresAt: new Date(Date.now() + 40 * DAY).toISOString(),
        bookable: 8,
        packageType: { name: "Nadoknada", sessionCount: 1, validityDays: 30 },
      }),
    ]);
    const upcoming = screen.getByTestId("client-upcoming-package-pkg-future");
    // The badge is what distinguishes it from the active card above.
    expect(upcoming.textContent).toContain("Još nije aktivan");
    // The bookable line belongs to the active card only — an upcoming package
    // has nothing to book, so printing a bookable count invites the 409.
    expect(upcoming.textContent).not.toContain("Slobodno za zakazivanje");
    expect(
      screen.getByTestId("client-package-bookable").textContent,
    ).toContain("Slobodno za zakazivanje: 8/8");
  });

  it("renders no upcoming section when nothing is upcoming", () => {
    const screen = renderPregled([makePackage()]);
    expect(screen.container.textContent).not.toContain("Uskoro dostupni paket");
  });

  it("does not announce a revoked package that would have started later", () => {
    const screen = renderPregled([
      makePackage({
        id: "pkg-revoked",
        startsAt: new Date(Date.now() + 5 * DAY).toISOString(),
        expiresAt: new Date(Date.now() + 40 * DAY).toISOString(),
        revokedAt: new Date(Date.now() - DAY).toISOString(),
        packageType: { name: "Opozvani paket", sessionCount: 8, validityDays: 60 },
      }),
    ]);
    expect(screen.container.textContent).not.toContain("Uskoro dostupni paket");
    expect(screen.container.textContent).not.toContain("Opozvani paket");
  });
});
