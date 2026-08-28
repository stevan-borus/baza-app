/**
 * Klijenti deep-link → assign-package sheet (Vitest Browser Mode, real
 * Chromium, real RNW, real i18n).
 *
 * A BIRTHDAY_ADMIN_PROMPT tap lands on /(admin)/klijenti carrying
 * `openAssignPackage=<clientUserId>`. The screen must open the
 * assign-package sheet for THAT client.
 *
 * The trap: the list is cursor-paginated (20 rows/page, ordered by random
 * uuid), and the sheet's target was derived with `clients.find()` over the
 * pages loaded SO FAR. A client sitting on page 2 is simply absent from that
 * array, so the sheet stayed shut and the deep link silently did nothing —
 * which client landed on page 2 was a per-seed lottery.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { waitFor } from "@testing-library/react";
import React from "react";
import "@/lib/i18n";
import { renderWithQueryClient } from "./helpers";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";
import { invitesQueries } from "@/lib/queries/invites-queries-factory";
import { packagesQueries } from "@/lib/queries/packages-queries-factory";

// The deep-link params the notification tap delivers. Mutated per test, read
// by the expo-router stub below.
let searchParams: Record<string, string> = {};

vi.mock("expo-router", async () => {
  const actual =
    await vi.importActual<typeof import("./stubs/expo-router")>(
      "./stubs/expo-router",
    );
  return { ...actual, useLocalSearchParams: () => searchParams };
});

const apiRequestMock = vi.fn(async () => ({ success: true }));
vi.mock("@/lib/api-request", () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...(args as [])),
}));

import AdminClients from "@/app/(admin)/klijenti/index";

/** The birthday client — deliberately NOT in the loaded first page. */
const PAGE_2_CLIENT = {
  id: "profile-page2",
  notes: null,
  packageStatus: "active" as const,
  user: {
    id: "user-page2",
    firstName: "Active",
    lastName: "Reformer Client",
    fullName: "Active Reformer Client",
    email: "client.active.reformer@e2e.test",
    phone: null,
    isActive: true,
    createdAt: new Date("2026-01-01").toISOString(),
  },
};

const REFORMER_12 = {
  id: "pt-reformer",
  name: "Reformer 12",
  sessionCount: 12,
  validityDays: 60,
  lateCancelHours: 12,
  price: 15000,
  classTypes: [{ id: "ct-reformer", name: "Reformer" }],
  isBirthdayGift: false,
};

/** 20 filler rows — a full first page, none of them the target. */
const PAGE_1_CLIENTS = Array.from({ length: 20 }, (_, i) => ({
  id: `profile-${i}`,
  notes: null,
  packageStatus: "active" as const,
  user: {
    id: `user-${i}`,
    firstName: "Filler",
    lastName: `Client ${i}`,
    fullName: `Filler Client ${i}`,
    email: `filler${i}@e2e.test`,
    phone: null,
    isActive: true,
    createdAt: new Date("2026-01-01").toISOString(),
  },
}));

function renderScreen() {
  return renderWithQueryClient(<AdminClients />, (client) => {
    // Header avatar reads the signed-in admin.
    client.setQueryData(authQueries.me().queryKey, {
      success: true,
      user: {
        id: "admin-1",
        email: "admin@e2e.test",
        firstName: "Admin",
        lastName: "User",
        fullName: "Admin User",
        role: "ADMIN" as const,
        isActive: true,
        createdAt: new Date("2026-01-01"),
        clientProfile: null,
      },
    });
    // Only page 1 is loaded — exactly what the screen has right after a
    // deep-link arrives. `profile-page2` exists on the server but not here.
    client.setQueryData(clientsQueries.list({}).queryKey, {
      pages: [
        {
          success: true,
          clients: PAGE_1_CLIENTS,
          nextCursor: "profile-19",
          total: 22,
        },
      ],
      pageParams: [null],
    });
    client.setQueryData(invitesQueries.list().queryKey, {
      success: true,
      invites: [],
    });
    client.setQueryData(packagesQueries.types().queryKey, {
      success: true,
      packageTypes: [REFORMER_12],
    });
    client.setQueryData(
      packagesQueries.clientPackages(PAGE_2_CLIENT.id).queryKey,
      { success: true, packages: [] },
    );
    // The byId cache the fix reads to resolve a target outside the loaded
    // pages. Seeded because the screen must not depend on a network round
    // trip it can serve from cache.
    client.setQueryData(clientsQueries.byId(PAGE_2_CLIENT.user.id).queryKey, {
      success: true,
      client: {
        ...PAGE_2_CLIENT,
        dateOfBirth: "1990-05-11",
        activePause: null,
      },
    });
    // Same resolution path for an already-loaded row.
    for (const c of PAGE_1_CLIENTS) {
      client.setQueryData(clientsQueries.byId(c.user.id).queryKey, {
        success: true,
        client: { ...c, dateOfBirth: null, activePause: null },
      });
      client.setQueryData(packagesQueries.clientPackages(c.id).queryKey, {
        success: true,
        packages: [],
      });
    }
  });
}

describe("klijenti deep-link → assign-package sheet", () => {
  beforeEach(() => {
    searchParams = {};
    apiRequestMock.mockClear();
  });

  it("opens the sheet for a client that is NOT in the loaded page set", async () => {
    searchParams = {
      openAssignPackage: PAGE_2_CLIENT.user.id,
      mode: "comp",
      initialPackageTypeId: REFORMER_12.id,
      initialClassTypeId: "ct-reformer",
    };

    const { getByTestId, queryByTestId } = renderScreen();

    // The sheet opens and offers the real priced package — the exact
    // assertion the e2e spec makes right before it fails.
    await waitFor(() => {
      expect(
        getByTestId(`assign-package-option-${REFORMER_12.id}`),
      ).toBeTruthy();
    });

    // And it STAYS open: clearing the deep-link params must not close it.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(
      queryByTestId(`assign-package-option-${REFORMER_12.id}`),
    ).toBeTruthy();
  });

  it("opens the sheet for a client that IS in the loaded page set", async () => {
    const target = PAGE_1_CLIENTS[3];
    searchParams = { openAssignPackage: target.user.id, mode: "comp" };

    const { getByTestId } = renderScreen();

    await waitFor(() => {
      expect(
        getByTestId(`assign-package-option-${REFORMER_12.id}`),
      ).toBeTruthy();
    });
  });

  it("does not open the sheet when no deep-link params are present", async () => {
    const { queryByTestId } = renderScreen();

    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(
      queryByTestId(`assign-package-option-${REFORMER_12.id}`),
    ).toBeNull();
  });
});
