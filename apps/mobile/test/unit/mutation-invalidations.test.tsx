/**
 * Cross-domain invalidation builders — mutations whose server-side effect
 * spans domains must invalidate every cache that renders the changed data,
 * because RN has no focus-refetch and tab screens stay mounted (a stale
 * query never self-heals; see the one-off-termin overview-calendar bug).
 *
 * Driven via MutationObserver against a real QueryClient (no RTL in this
 * repo), mirroring cat-b-splices.test.tsx.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { QueryClient, MutationObserver } from "@tanstack/react-query";

vi.mock("@/lib/env.shared", () => ({
  sharedEnv: { EXPO_PUBLIC_API_URL: "http://test.local" },
}));
vi.mock("@/lib/api", () => ({ apiFetch: vi.fn(), throwIfNotOk: vi.fn() }));

import {
  assignClientPackageMutationOptions,
  pausePackageMutationOptions,
} from "@/lib/queries/packages-queries-factory";
import { createBillingMutationOptions } from "@/lib/queries/billing-queries-factory";
import {
  createClientMutationOptions,
  updateClientMutationOptions,
} from "@/lib/queries/clients-queries-factory";
import { mutateBookingMutationOptions } from "@/lib/queries/bookings-queries-factory";
import { sendCampaignMutationOptions } from "@/lib/queries/campaigns-queries-factory";

let client: QueryClient;
let invalidateSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  invalidateSpy = vi.spyOn(client, "invalidateQueries");
});

/** Root keys of every invalidateQueries call so far. */
function invalidatedRoots(): string[] {
  return invalidateSpy.mock.calls
    .map((args: unknown[]) => {
      const k = (args[0] as { queryKey?: readonly unknown[] } | undefined)?.queryKey;
      return k?.[0];
    })
    .filter((r: unknown): r is string => typeof r === "string");
}

describe("client package assignment (comp)", () => {
  it("invalidates packages + clients (packageStatus) + reports (summary)", async () => {
    const observer = new MutationObserver(client, {
      ...assignClientPackageMutationOptions(client),
      mutationFn: async () => ({ success: true }),
    });
    await observer.mutate({
      clientProfileId: "cp1",
      packageTypeId: "pt1",
      startsAt: "2026-01-01T00:00:00.000Z",
    });

    const roots = invalidatedRoots();
    expect(roots).toContain("packages");
    expect(roots).toContain("clients");
    expect(roots).toContain("reports");
  });
});

describe("package pause", () => {
  it("invalidates clients — packageStatus flips to paused", async () => {
    // PackagePause rows aren't in any ["packages"] response; the visible
    // effect is the derived packageStatus under ["clients"].
    const observer = new MutationObserver(client, {
      ...pausePackageMutationOptions(client),
      mutationFn: async () => ({ success: true }),
    });
    await observer.mutate({
      clientProfileId: "cp1",
      startsAt: "2026-01-01T00:00:00.000Z",
      endsAt: "2026-01-08T00:00:00.000Z",
    });

    expect(invalidatedRoots()).toContain("clients");
  });
});

describe("billing create", () => {
  it("invalidates billing + reports (revenue) + packages/clients (package may activate)", async () => {
    // A payment always changes the revenue figures on the always-mounted
    // Pregled; with activatePackageOnConfirm it also creates a ClientPackage
    // in the same transaction.
    const observer = new MutationObserver(client, {
      ...createBillingMutationOptions(client),
      mutationFn: async () => ({ success: true }),
    });
    await observer.mutate({
      clientUserId: "u1",
      packageTypeId: "pt1",
      amount: 5000,
      method: "CASH",
      activatePackageOnConfirm: true,
    });

    const roots = invalidatedRoots();
    expect(roots).toContain("billing");
    expect(roots).toContain("reports");
    expect(roots).toContain("packages");
    expect(roots).toContain("clients");
  });
});

describe("client create/update", () => {
  it("create invalidates clients + reports (totalClients on Pregled)", async () => {
    const observer = new MutationObserver(client, {
      ...createClientMutationOptions(client),
      mutationFn: async () => ({ success: true }),
    });
    await observer.mutate({
      email: "novi@x.com",
      firstName: "Novi",
      lastName: "Klijent",
      dateOfBirth: "1990-01-01",
    });

    const roots = invalidatedRoots();
    expect(roots).toContain("clients");
    expect(roots).toContain("reports");
  });

  it("update invalidates clients + reports (isActive drives activeClients)", async () => {
    const observer = new MutationObserver(client, {
      ...updateClientMutationOptions(client),
      mutationFn: async () => ({ success: true }),
    });
    await observer.mutate({ id: "c1", isActive: false });

    const roots = invalidatedRoots();
    expect(roots).toContain("clients");
    expect(roots).toContain("reports");
  });
});

describe("client booking (BOOK/CANCEL)", () => {
  it("invalidates sessions + packages + client-packages timeline + bookings", async () => {
    // Booking holds a package session; a late CANCEL forfeits one
    // (sessionsRemaining). The Paketi tab renders ["client-packages","timeline"]
    // (no pull-to-refresh) and history renders ["bookings","by-client",...] —
    // both must refetch alongside availability.
    const observer = new MutationObserver(client, {
      ...mutateBookingMutationOptions(client),
      mutationFn: async () => ({ success: true, state: "BOOKED" as const }),
    });
    await observer.mutate({ sessionId: "s1", action: "BOOK" });

    const roots = invalidatedRoots();
    expect(roots).toContain("sessions");
    expect(roots).toContain("packages");
    expect(roots).toContain("client-packages");
    expect(roots).toContain("bookings");
  });
});

describe("campaign send", () => {
  it("invalidates the campaign's recipients — projected flips to actual", async () => {
    // The recipients route answers with the projected audience before send
    // and the frozen NotificationLog recipients after — the cached projection
    // must not survive the send.
    const observer = new MutationObserver(client, {
      ...sendCampaignMutationOptions(client),
      mutationFn: async () => ({
        campaign: {
          id: "camp1",
          title: "T",
          body: "B",
          audienceSpec: {},
          recipientCount: 3,
          status: "SENT" as const,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    });
    await observer.mutate("camp1");

    expect(
      invalidateSpy.mock.calls.some((args: unknown[]) => {
        const k = (args[0] as { queryKey?: readonly unknown[] } | undefined)?.queryKey;
        return k?.[0] === "campaigns" && k?.[1] === "recipients" && k?.[2] === "camp1";
      }),
    ).toBe(true);
  });
});
