/**
 * One green card per SPENDABLE POOL on the client home.
 *
 * A real studio client held a Reformer Personal, a StrongHer and three
 * 1-session Reformer 12s, and the home screen showed her a single card reading
 * "23 / 24" with a footnote apologising that two more packages existed
 * somewhere. Credits only merge within a covered ClassType set (CONTEXT.md →
 * PackageType), so those three pools each need their own card — and the three
 * Reformer 12s, sharing a set, need to read "3" on ONE card rather than three
 * cards reading "1".
 *
 * Home caps the list at two so the hero and the week strip stay above the fold;
 * past that a link points at Moji paketi, which itemises every package.
 */
import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { fireEvent } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";
import React from "react";
import "@/lib/i18n";
import { renderWithQueryClient } from "./helpers";
import { routerCalls } from "./stubs/expo-router";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import {
  packagesQueries,
  type ClientPackage,
} from "@/lib/queries/packages-queries-factory";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
import HomeStudio from "@/app/(client)/index";

const ANCHOR = "2026-05-09T10:00:00.000Z";
const MONTH = "2026-05";

const REFORMER = { id: "ct-reformer", name: "Reformer pilates" };
const PERSONAL = { id: "ct-personal", name: "Personalni trening" };
const STRONGHER = { id: "ct-strongher", name: "StrongHer (funkcionalni trening)" };

function pkg(
  over: Partial<ClientPackage> & { id: string },
): ClientPackage {
  return {
    clientProfileId: "cp1",
    packageTypeId: "pt1",
    sessionsRemaining: 1,
    sessionsTotal: 1,
    expiresAt: "2026-06-01T00:00:00.000Z",
    startsAt: "2026-05-01T00:00:00.000Z",
    ...over,
  } as ClientPackage;
}

function seed(packages: ClientPackage[]) {
  return (client: QueryClient) => {
    client.setQueryData(authQueries.me().queryKey, {
      success: true,
      user: {
        id: "u1",
        email: "slavica@demo.baza.rs",
        firstName: "Slavica",
        lastName: "Ilić",
        fullName: "Slavica Ilić",
        role: "CLIENT" as const,
        isActive: true,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        clientProfile: { id: "cp1" },
      },
    });
    client.setQueryData(packagesQueries.clientPackages().queryKey, {
      success: true,
      packages,
    });
    client.setQueryData(sessionsQueries.availabilityByMonth(MONTH).queryKey, {
      success: true,
      month: MONTH,
      sessions: [],
    });
  };
}

const TWO_SCOPES = [
  pkg({ id: "personal", sessionsRemaining: 12, sessionsTotal: 12, bookable: 12, classTypes: [PERSONAL], packageType: { name: "Reformer Personal", sessionCount: 12, validityDays: 30 } }),
  pkg({ id: "strong", sessionsRemaining: 5, sessionsTotal: 12, bookable: 5, classTypes: [STRONGHER], packageType: { name: "StrongHer", sessionCount: 12, validityDays: 30 } }),
];

// The real client: two Personal, two StrongHer, three 1-session Reformer 12s.
const THREE_SCOPES = [
  ...TWO_SCOPES,
  pkg({ id: "r1", sessionsRemaining: 1, sessionsTotal: 1, bookable: 1, classTypes: [REFORMER], packageType: { name: "Reformer 12", sessionCount: 12, validityDays: 30 } }),
  pkg({ id: "r2", sessionsRemaining: 1, sessionsTotal: 1, bookable: 1, classTypes: [REFORMER], packageType: { name: "Reformer 12", sessionCount: 12, validityDays: 30 } }),
  pkg({ id: "r3", sessionsRemaining: 1, sessionsTotal: 1, bookable: 1, classTypes: [REFORMER], packageType: { name: "Reformer 12", sessionCount: 12, validityDays: 30 } }),
];

describe("client home — a card per package scope", () => {
  beforeEach(() => {
    process.env.TEST_ANCHOR_TIME = ANCHOR;
    routerCalls.length = 0;
  });
  afterEach(() => {
    delete process.env.TEST_ANCHOR_TIME;
  });

  it("shows one card and the singular header for a single-scope client", () => {
    const screen = renderWithQueryClient(
      <HomeStudio />,
      seed([TWO_SCOPES[0]!]),
    );
    expect(screen.getAllByTestId("package-sessions-remaining")).toHaveLength(1);
    // CapsLabel uppercases in CSS, so the DOM carries the source copy.
    expect(screen.getByText("Tvoj paket")).toBeTruthy();
    expect(screen.queryByText("Tvoji paketi")).toBeNull();
  });

  it("shows a card per scope, biggest pool first, under the plural header", () => {
    const screen = renderWithQueryClient(<HomeStudio />, seed(TWO_SCOPES));
    const counts = screen
      .getAllByTestId("package-sessions-remaining")
      .map((n) => n.textContent);
    expect(counts).toEqual(["12", "5"]);
    expect(screen.getByText("Tvoji paketi")).toBeTruthy();
    expect(screen.getByText("Reformer Personal")).toBeTruthy();
    expect(screen.getByText("StrongHer")).toBeTruthy();
  });

  it("keeps the overflow link off a two-scope client", () => {
    const screen = renderWithQueryClient(<HomeStudio />, seed(TWO_SCOPES));
    expect(screen.queryByTestId("home-show-all-packages")).toBeNull();
  });

  it("caps a three-scope client at two cards and links to Moji paketi", () => {
    const screen = renderWithQueryClient(<HomeStudio />, seed(THREE_SCOPES));
    expect(screen.getAllByTestId("package-sessions-remaining")).toHaveLength(2);
    // The dropped scope is the smallest pool — never the biggest.
    expect(screen.queryByText("Reformer 12")).toBeNull();

    const link = screen.getByTestId("home-show-all-packages");
    expect(link.textContent).toBe("Prikaži sve pakete");
    fireEvent.click(link);
    expect(routerCalls.at(-1)).toEqual({
      method: "push",
      args: ["/(client)/profile"],
    });
  });

  it("merges same-scope packages into one card instead of stacking duplicates", () => {
    // Three 1-session Reformer 12s are one pool of 3, not three cards of 1.
    const screen = renderWithQueryClient(
      <HomeStudio />,
      seed(THREE_SCOPES.slice(2)),
    );
    const counts = screen
      .getAllByTestId("package-sessions-remaining")
      .map((n) => n.textContent);
    expect(counts).toEqual(["3"]);
    expect(screen.getByText("Tvoj paket")).toBeTruthy();
  });

  it("never apologises for packages it isn't showing", () => {
    const screen = renderWithQueryClient(<HomeStudio />, seed(THREE_SCOPES));
    expect(screen.queryByTestId("package-other-groups")).toBeNull();
    expect(screen.container.textContent).not.toContain("Imate još");
  });
});

/**
 * A package the studio dated to start later must be VISIBLE and clearly not
 * bookable yet.
 *
 * The reported bug: a client was assigned two Nadoknada packages, one starting
 * today and one in five days, and the second was invisible to everyone. The
 * data was always on the wire — three client-side filters dropped it and no
 * surface picked it up. It now gets its own muted section that states the day
 * it becomes usable, while every bookable number on the screen stays untouched.
 */
const UPCOMING_NADOKNADA = pkg({
  id: "nadoknada-later",
  sessionsRemaining: 1,
  sessionsTotal: 1,
  bookable: 1,
  startsAt: "2026-05-14T00:00:00.000Z",
  expiresAt: "2026-06-14T00:00:00.000Z",
  classTypes: [REFORMER],
  packageType: { name: "Nadoknada", sessionCount: 1, validityDays: 30 },
});

describe("client home — an upcoming package is visible but not bookable", () => {
  beforeEach(() => {
    process.env.TEST_ANCHOR_TIME = ANCHOR;
    routerCalls.length = 0;
  });
  afterEach(() => {
    delete process.env.TEST_ANCHOR_TIME;
  });

  it("shows the upcoming package with the date it becomes usable", () => {
    const screen = renderWithQueryClient(
      <HomeStudio />,
      seed([UPCOMING_NADOKNADA]),
    );
    const card = screen.getByTestId("home-upcoming-package-nadoknada-later");
    expect(card.textContent).toContain("Nadoknada");
    expect(card.textContent).toContain("Dostupan od 14.5.2026.");
    expect(screen.getByText("Uskoro")).toBeTruthy();
  });

  it("does not add the upcoming package's credits to an active pool", () => {
    // Same covered set as the active 12-pack, so merging is exactly what the
    // grouping rules would do if the filter ever slipped. The headline must
    // stay 12 — the 13th credit is not spendable until the 14th.
    const active = pkg({
      id: "reformer-12",
      sessionsRemaining: 12,
      sessionsTotal: 12,
      bookable: 12,
      classTypes: [REFORMER],
      packageType: { name: "Reformer 12", sessionCount: 12, validityDays: 30 },
    });
    const screen = renderWithQueryClient(
      <HomeStudio />,
      seed([active, UPCOMING_NADOKNADA]),
    );
    const counts = screen
      .getAllByTestId("package-sessions-remaining")
      .map((n) => n.textContent);
    expect(counts).toEqual(["12"]);
    // One bookable pool, so the header stays singular even with the upcoming
    // package on screen.
    expect(screen.getByText("Tvoj paket")).toBeTruthy();
    expect(
      screen.getByTestId("home-upcoming-package-nadoknada-later"),
    ).toBeTruthy();
  });

  it("keeps the renewal card when the ONLY package is upcoming", () => {
    // Nothing is bookable today, so the renewal fall-through is still correct.
    // The client now also learns something is on the way.
    const lapsed = pkg({
      id: "lapsed",
      sessionsRemaining: 0,
      sessionsTotal: 12,
      expiresAt: "2026-05-01T00:00:00.000Z",
      packageType: { name: "Reformer 12", sessionCount: 12, validityDays: 30 },
    });
    const screen = renderWithQueryClient(
      <HomeStudio />,
      seed([lapsed, UPCOMING_NADOKNADA]),
    );
    expect(screen.getByTestId("home-renewal-card")).toBeTruthy();
    expect(
      screen.getByTestId("home-upcoming-package-nadoknada-later").textContent,
    ).toContain("Dostupan od 14.5.2026.");
    expect(screen.queryAllByTestId("package-sessions-remaining")).toHaveLength(0);
  });

  it("renders no upcoming section when every package has already started", () => {
    const screen = renderWithQueryClient(<HomeStudio />, seed(TWO_SCOPES));
    expect(screen.container.textContent).not.toContain("Uskoro");
  });
});
