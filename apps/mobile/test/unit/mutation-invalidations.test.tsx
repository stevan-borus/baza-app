/**
 * Cross-domain invalidation contracts — mutations whose server-side effect
 * spans domains must refresh every cache that renders the changed data,
 * because RN has no focus-refetch and tab screens stay mounted (a stale
 * query never self-heals; see the one-off-termin overview-calendar bug).
 *
 * Assertions are state-based, not spy-based: each test seeds the affected
 * caches, runs the mutation through a MutationObserver against a real
 * QueryClient (no RTL in this repo), and asserts the seeded queries ended up
 * stale (`isInvalidated`) — the observable QueryClient contract — rather
 * than that `invalidateQueries` happened to be called with some key.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  QueryClient,
  MutationObserver,
  QueryObserver,
} from "@tanstack/react-query";

vi.mock("@/lib/env.shared", () => ({
  sharedEnv: { EXPO_PUBLIC_API_URL: "http://test.local" },
}));
vi.mock("@/lib/api", () => ({ apiFetch: vi.fn(), throwIfNotOk: vi.fn() }));

import {
  packagesQueries,
  assignClientPackageMutationOptions,
  pausePackageMutationOptions,
  endPackagePauseMutationOptions,
  revokeClientPackageMutationOptions,
} from "@/lib/queries/packages-queries-factory";
import {
  billingQueries,
  createBillingMutationOptions,
  confirmBillingMutationOptions,
} from "@/lib/queries/billing-queries-factory";
import {
  clientsQueries,
  updateClientMutationOptions,
} from "@/lib/queries/clients-queries-factory";
import {
  bookingsQueries,
  mutateBookingMutationOptions,
} from "@/lib/queries/bookings-queries-factory";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
import { clientPackagesTimelineQueries } from "@/lib/queries/client-packages-timeline-queries-factory";
import { reportsQueries } from "@/lib/queries/reports-queries-factory";
import {
  campaignsQueries,
  sendCampaignMutationOptions,
} from "@/lib/queries/campaigns-queries-factory";

// Representative cache entries under each domain root — the screens that
// rendered stale data in the audited bugs. Seeded before each mutation so
// the invalidation has real cache entries to hit.
const clientsListKey = [...clientsQueries.all, "list"];
const reportsSummaryKey = [...reportsQueries.all, "summary"];
const packageTypesKey = [...packagesQueries.all, "types"];
const billingListKey = [...billingQueries.all, "list"];
const availabilityKey = [...sessionsQueries.all, "availability", "2026-01"];
const timelineKey = [...clientPackagesTimelineQueries.all, "timeline"];
const bookingsHistoryKey = [...bookingsQueries.all, "by-client", "u1"];
// Upcoming bookings hero / client list — revoke cancels the FUTURE bookings a
// package backed, so these must refetch (they don't self-heal, no focus refetch).
const bookingsUpcomingKey = [...bookingsQueries.all, "by-client", "u1", "upcoming"];
// Control: a domain none of these mutations should ever touch.
const unrelatedKey = ["auth", "me"];

let client: QueryClient;

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

function seed(...keys: unknown[][]) {
  for (const key of keys) client.setQueryData(key, { seeded: true });
}

/** The observable contract: the seeded query is stale and will refetch. */
function isStale(key: unknown[]) {
  return client.getQueryState(key)?.isInvalidated === true;
}

describe("client package assignment (comp)", () => {
  it("marks packages + clients (packageStatus) + reports (summary) stale", async () => {
    seed(packageTypesKey, clientsListKey, reportsSummaryKey, unrelatedKey);
    const observer = new MutationObserver(client, {
      ...assignClientPackageMutationOptions(client),
      mutationFn: async () => ({ success: true }),
    });
    await observer.mutate({
      clientProfileId: "cp1",
      packageTypeId: "pt1",
      startsAt: "2026-01-01T00:00:00.000Z",
    });

    expect(isStale(packageTypesKey)).toBe(true);
    expect(isStale(clientsListKey)).toBe(true);
    expect(isStale(reportsSummaryKey)).toBe(true);
    expect(isStale(unrelatedKey)).toBe(false);
  });
});

describe("package pause", () => {
  it("marks clients + packages + bookings + sessions + timeline stale", async () => {
    // A pause is not just a status flip any more: it cancels the client's
    // reservations in the window (freeing seats, promoting waitlisters) and
    // pushes every live package's expiresAt out. Every surface showing those
    // has to refetch, or the app keeps rendering seats and expiry dates the
    // server no longer agrees with.
    seed(
      clientsListKey,
      packageTypesKey,
      reportsSummaryKey,
      bookingsUpcomingKey,
      availabilityKey,
      timelineKey,
      unrelatedKey,
    );
    const observer = new MutationObserver(client, {
      ...pausePackageMutationOptions(client),
      mutationFn: async () => ({ success: true }),
    });
    await observer.mutate({
      clientProfileId: "cp1",
      startsAt: "2026-01-01T00:00:00.000Z",
      endsAt: "2026-01-08T00:00:00.000Z",
    });

    expect(isStale(clientsListKey)).toBe(true);
    expect(isStale(packageTypesKey)).toBe(true);
    expect(isStale(reportsSummaryKey)).toBe(true);
    expect(isStale(bookingsUpcomingKey)).toBe(true);
    expect(isStale(availabilityKey)).toBe(true);
    expect(isStale(timelineKey)).toBe(true);
    expect(isStale(unrelatedKey)).toBe(false);
  });

  it("ending a pause refreshes expiry surfaces but leaves bookings alone", async () => {
    // Ending early gives expiry time back; it deliberately restores no
    // bookings, so the booking/session caches have nothing to refetch.
    seed(clientsListKey, packageTypesKey, timelineKey, bookingsUpcomingKey);
    const observer = new MutationObserver(client, {
      ...endPackagePauseMutationOptions(client),
      mutationFn: async () => ({ success: true }),
    });
    await observer.mutate("pause-1");

    expect(isStale(clientsListKey)).toBe(true);
    expect(isStale(packageTypesKey)).toBe(true);
    expect(isStale(timelineKey)).toBe(true);
    expect(isStale(bookingsUpcomingKey)).toBe(false);
  });
});

describe("billing create", () => {
  it("marks billing + reports (revenue) + packages/clients stale (package may activate)", async () => {
    // A payment always changes the revenue figures on the always-mounted
    // Pregled; with activatePackageOnConfirm it also creates a ClientPackage
    // in the same transaction.
    seed(billingListKey, reportsSummaryKey, packageTypesKey, clientsListKey);
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

    expect(isStale(billingListKey)).toBe(true);
    expect(isStale(reportsSummaryKey)).toBe(true);
    expect(isStale(packageTypesKey)).toBe(true);
    expect(isStale(clientsListKey)).toBe(true);
  });
});

describe("billing confirm (PENDING → CONFIRMED)", () => {
  it("marks billing + reports + packages + clients + client-packages timeline stale", async () => {
    // Confirming settles the debt: the Naplata row flips, revenue moves, and
    // the paymentPending banner must clear on BOTH the admin package rows
    // (["packages"]) AND the client-facing timeline (["client-packages"]) —
    // the timeline was the surface the old, narrower set left stale.
    seed(
      billingListKey,
      reportsSummaryKey,
      packageTypesKey,
      clientsListKey,
      timelineKey,
      bookingsUpcomingKey,
      unrelatedKey,
    );
    const observer = new MutationObserver(client, {
      ...confirmBillingMutationOptions(client),
      mutationFn: async () => ({ success: true }),
    });
    await observer.mutate({ id: "b1", method: "CARD" });

    expect(isStale(billingListKey)).toBe(true);
    expect(isStale(reportsSummaryKey)).toBe(true);
    expect(isStale(packageTypesKey)).toBe(true);
    expect(isStale(clientsListKey)).toBe(true);
    expect(isStale(timelineKey)).toBe(true);
    // Confirm moves NO bookings — the upcoming list must NOT be invalidated.
    expect(isStale(bookingsUpcomingKey)).toBe(false);
    expect(isStale(unrelatedKey)).toBe(false);
  });
});

describe("client package revoke", () => {
  it("marks the FULL superset stale — packages, clients, reports, billing, bookings, sessions, timeline", async () => {
    // The widest write in the app: one transaction revokes the package,
    // cancels future bookings, deletes waitlist entries (firing promotions),
    // and voids the linked PENDING billing record. Under-invalidating here is
    // exactly what left stale bookedCount/spots (["sessions"]), the client's
    // upcoming bookings (["bookings"]) and the package timeline
    // (["client-packages"]) on live devices.
    seed(
      packageTypesKey,
      clientsListKey,
      reportsSummaryKey,
      billingListKey,
      bookingsUpcomingKey,
      availabilityKey,
      timelineKey,
      unrelatedKey,
    );
    const observer = new MutationObserver(client, {
      ...revokeClientPackageMutationOptions(client),
      mutationFn: async () => ({ success: true }),
    });
    await observer.mutate("pkg1");

    expect(isStale(packageTypesKey)).toBe(true);
    expect(isStale(clientsListKey)).toBe(true);
    expect(isStale(reportsSummaryKey)).toBe(true);
    expect(isStale(billingListKey)).toBe(true);
    expect(isStale(bookingsUpcomingKey)).toBe(true);
    expect(isStale(availabilityKey)).toBe(true);
    expect(isStale(timelineKey)).toBe(true);
    expect(isStale(unrelatedKey)).toBe(false);
  });
});

describe("client update", () => {
  it("update marks clients + reports stale (isActive drives activeClients)", async () => {
    seed(clientsListKey, reportsSummaryKey);
    const observer = new MutationObserver(client, {
      ...updateClientMutationOptions(client),
      mutationFn: async () => ({ success: true }),
    });
    await observer.mutate({ id: "c1", isActive: false });

    expect(isStale(clientsListKey)).toBe(true);
    expect(isStale(reportsSummaryKey)).toBe(true);
  });
});

describe("client booking (BOOK/CANCEL)", () => {
  it("marks sessions + packages + client-packages timeline + bookings stale", async () => {
    // Booking holds a package session; a late CANCEL forfeits one
    // (sessionsRemaining). The Paketi tab renders ["client-packages","timeline"]
    // (no pull-to-refresh) and history renders ["bookings","by-client",...] —
    // both must refetch alongside availability.
    seed(availabilityKey, packageTypesKey, timelineKey, bookingsHistoryKey, unrelatedKey);
    const observer = new MutationObserver(client, {
      ...mutateBookingMutationOptions(client),
      mutationFn: async () => ({ success: true, state: "BOOKED" as const }),
    });
    await observer.mutate({ sessionId: "s1", action: "BOOK" });

    expect(isStale(availabilityKey)).toBe(true);
    expect(isStale(packageTypesKey)).toBe(true);
    expect(isStale(timelineKey)).toBe(true);
    expect(isStale(bookingsHistoryKey)).toBe(true);
    expect(isStale(unrelatedKey)).toBe(false);
  });
});

describe("campaign send", () => {
  const sentCampaign = {
    id: "camp1",
    title: "T",
    body: "B",
    audienceSpec: {},
    recipientCount: 3,
    status: "SENT" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("marks the campaign's recipients stale — projected flips to actual", async () => {
    // The recipients route answers with the projected audience before send
    // and the frozen NotificationLog recipients after — the cached projection
    // must not survive the send.
    client.setQueryData(campaignsQueries.recipients("camp1").queryKey, {
      actual: false,
      clients: [],
    });
    const observer = new MutationObserver(client, {
      ...sendCampaignMutationOptions(client),
      mutationFn: async () => ({ campaign: sentCampaign }),
    });
    await observer.mutate("camp1");

    expect(
      client.getQueryState(campaignsQueries.recipients("camp1").queryKey)
        ?.isInvalidated,
    ).toBe(true);
  });

  it("settles only after an actively-observed recipients list has refetched", async () => {
    // The send screen keeps the recipients list mounted — if the mutation
    // reports success while the projected→actual refetch is still in flight,
    // the UI flips to "sent" over the stale projection.
    let calls = 0;
    let completed = 0;
    let releaseRefetch!: () => void;
    const refetchGate = new Promise<void>((resolve) => {
      releaseRefetch = resolve;
    });
    const recipientsObserver = new QueryObserver(client, {
      queryKey: campaignsQueries.recipients("camp1").queryKey,
      queryFn: async () => {
        calls += 1;
        if (calls > 1) await refetchGate;
        completed += 1;
        return { actual: calls > 1, clients: [] };
      },
      retry: false,
    });
    const unsubscribe = recipientsObserver.subscribe(() => {});
    await vi.waitFor(() => expect(completed).toBe(1));

    const observer = new MutationObserver(client, {
      ...sendCampaignMutationOptions(client),
      mutationFn: async () => ({ campaign: sentCampaign }),
    });

    let mutateSettled = false;
    const mutatePromise = observer.mutate("camp1").then(() => {
      mutateSettled = true;
    });
    await vi.waitFor(() => expect(calls).toBe(2)); // refetch is in flight
    expect(mutateSettled).toBe(false);

    releaseRefetch();
    await mutatePromise;
    expect(completed).toBe(2);
    unsubscribe();
  });
});
