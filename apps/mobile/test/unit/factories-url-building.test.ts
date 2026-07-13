/**
 * URL characterization for the factories migrated onto the apiRequest seam —
 * the ADR-0003 sites that previously had no unit net (reports, trainer-notes,
 * bookings, billing). Mirrors clients-queries-factory.test.ts: mock the
 * transport, assert the wire URL.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/env.shared", () => ({
  sharedEnv: { EXPO_PUBLIC_API_URL: "http://test.local" },
}));

const fetchMock = vi.fn();
vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => fetchMock(...args),
}));

import { billingQueries } from "@/lib/queries/billing-queries-factory";
import { bookingsQueries } from "@/lib/queries/bookings-queries-factory";
import { reportsQueries } from "@/lib/queries/reports-queries-factory";
import { trainerNotesQueries } from "@/lib/queries/trainer-notes-queries-factory";

function jsonResponse(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: async () => body });
}

function calledUrl(): string {
  return fetchMock.mock.calls[0][0] as string;
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe("reports factory URLs", () => {
  const emptySummary = {
    success: true,
    summary: {
      totalClients: 0,
      activeClients: 0,
      inactiveClients: 0,
      totalSessions: 0,
      revenue: 0,
      totalPayments: 0,
    },
  };

  it("summary without params hits the bare endpoint — no '?'", async () => {
    fetchMock.mockReturnValueOnce(jsonResponse(emptySummary));
    await reportsQueries.summary().queryFn!({} as never);
    expect(calledUrl()).toBe("http://test.local/api/reports/summary");
  });

  it("summary forwards from/to", async () => {
    fetchMock.mockReturnValueOnce(jsonResponse(emptySummary));
    await reportsQueries
      .summary({ from: "2026-06-01", to: "2026-06-30" })
      .queryFn!({} as never);
    expect(calledUrl()).toBe(
      "http://test.local/api/reports/summary?from=2026-06-01&to=2026-06-30",
    );
  });

  it("utilizationByRoom forwards from/to/period", async () => {
    fetchMock.mockReturnValueOnce(
      jsonResponse({ success: true, data: [] }),
    );
    await reportsQueries
      .utilizationByRoom({ from: "2026-06-01", to: "2026-06-30", period: "month" })
      .queryFn!({} as never);
    expect(calledUrl()).toBe(
      "http://test.local/api/reports/utilization/by-room?from=2026-06-01&to=2026-06-30&period=month",
    );
  });
});

describe("trainer-notes factory URLs", () => {
  const emptyNotes = { success: true, notes: [], nextCursor: null };

  it("list without params hits the bare endpoint", async () => {
    fetchMock.mockReturnValueOnce(jsonResponse(emptyNotes));
    await trainerNotesQueries.list().queryFn!({} as never);
    expect(calledUrl()).toBe("http://test.local/api/trainer-notes");
  });

  it("multi-select filters go over the wire comma-separated; empty arrays are omitted", async () => {
    fetchMock.mockReturnValueOnce(jsonResponse(emptyNotes));
    await trainerNotesQueries
      .list({ sessionIds: ["s1", "s2"], clientProfileIds: [], take: 10 })
      .queryFn!({} as never);
    expect(calledUrl()).toBe(
      "http://test.local/api/trainer-notes?sessionIds=s1%2Cs2&take=10",
    );
  });

  it("listInfinite forwards the cursor page param", async () => {
    fetchMock.mockReturnValueOnce(jsonResponse(emptyNotes));
    await trainerNotesQueries
      .listInfinite({ clientProfileId: "cp-1" })
      .queryFn!({ pageParam: "cur-9" } as never);
    expect(calledUrl()).toBe(
      "http://test.local/api/trainer-notes?clientProfileId=cp-1&cursor=cur-9",
    );
  });
});

describe("bookings factory URLs", () => {
  const emptyBookings = { success: true, bookings: [], nextCursor: null };

  it("byClient always sends period; limit/cursor only when present", async () => {
    fetchMock.mockReturnValueOnce(jsonResponse(emptyBookings));
    await bookingsQueries
      .byClient({ clientUserId: "u-1", period: "upcoming" })
      .queryFn!({ pageParam: null } as never);
    expect(calledUrl()).toBe(
      "http://test.local/api/clients/u-1/bookings?period=upcoming",
    );

    fetchMock.mockReset();
    fetchMock.mockReturnValueOnce(jsonResponse(emptyBookings));
    await bookingsQueries
      .byClient({ clientUserId: "u-1", period: "past", limit: 5 })
      .queryFn!({ pageParam: "cur-3" } as never);
    expect(calledUrl()).toBe(
      "http://test.local/api/clients/u-1/bookings?period=past&limit=5&cursor=cur-3",
    );
  });
});

describe("billing factory URLs", () => {
  const emptyBilling = { success: true, records: [], nextCursor: null };

  it("listInfinite without filters hits the bare endpoint", async () => {
    fetchMock.mockReturnValueOnce(jsonResponse(emptyBilling));
    await billingQueries.listInfinite().queryFn!({ pageParam: null } as never);
    expect(calledUrl()).toBe("http://test.local/api/billing");
  });

  it("listInfinite forwards filters + cursor", async () => {
    fetchMock.mockReturnValueOnce(jsonResponse(emptyBilling));
    await billingQueries
      .listInfinite({ clientUserId: "u-1", from: "2026-06-01", to: "2026-06-30" })
      .queryFn!({ pageParam: "cur-2" } as never);
    expect(calledUrl()).toBe(
      "http://test.local/api/billing?cursor=cur-2&clientUserId=u-1&from=2026-06-01&to=2026-06-30",
    );
  });

  it("confirm PATCHes /api/billing/:id with status CONFIRMED + edited method", async () => {
    fetchMock.mockReturnValueOnce(
      jsonResponse({ success: true, payment: { id: "b-1" } }),
    );
    await billingQueries
      .confirm()
      .mutationFn!({ id: "b-1", method: "CARD" }, {} as never);
    expect(calledUrl()).toBe("http://test.local/api/billing/b-1");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({
      status: "CONFIRMED",
      method: "CARD",
    });
  });
});

describe("packages factory URLs — revoke", () => {
  it("revokeClientPackage POSTs to /api/packages/client-packages/:id/revoke", async () => {
    fetchMock.mockReturnValueOnce(jsonResponse({ success: true }));
    const { packagesQueries } = await import(
      "@/lib/queries/packages-queries-factory"
    );
    await packagesQueries
      .revokeClientPackage()
      .mutationFn!("pkg-9", {} as never);
    expect(calledUrl()).toBe(
      "http://test.local/api/packages/client-packages/pkg-9/revoke",
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
  });
});
