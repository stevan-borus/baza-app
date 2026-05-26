/**
 * Unit test for the reservations queries factory request helpers. Asserts
 * the URL, method, body and response parsing for create + cancel-bulk
 * without spinning up a React tree (renderHook isn't available in this
 * project — same constraint as the notifications-inbox/bell tests).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/env.shared", () => ({
  sharedEnv: { EXPO_PUBLIC_API_URL: "http://test.local" },
}));

const fetchMock = vi.fn();
vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => fetchMock(...args),
  throwIfNotOk: async (res: { ok: boolean; status: number }) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  },
}));

import {
  createReservationsRequest,
  cancelReservationsBulkRequest,
} from "@/lib/queries/reservations-queries-factory";

function jsonResponse(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => body,
  });
}

describe("createReservationsRequest", () => {
  beforeEach(() => fetchMock.mockReset());
  afterEach(() => vi.clearAllMocks());

  it("POSTs to /api/admin/reservations with the JSON body and parses the response", async () => {
    fetchMock.mockReturnValueOnce(
      jsonResponse({
        success: true,
        reserved: 2,
        reservedSessionIds: ["s1", "s2"],
        skippedFull: [],
        skippedAlreadyBooked: [],
        skippedMissing: [],
      }),
    );
    const data = await createReservationsRequest({
      clientProfileId: "client-1",
      sessionIds: ["s1", "s2"],
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://test.local/api/admin/reservations");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(
      JSON.stringify({ clientProfileId: "client-1", sessionIds: ["s1", "s2"] }),
    );
    expect(data.reserved).toBe(2);
    expect(data.reservedSessionIds).toEqual(["s1", "s2"]);
  });

  it("throws on non-OK response", async () => {
    fetchMock.mockReturnValueOnce(
      Promise.resolve({ ok: false, status: 500, json: async () => ({}) }),
    );
    await expect(
      createReservationsRequest({
        clientProfileId: "c",
        sessionIds: ["s"],
      }),
    ).rejects.toThrow(/HTTP 500/);
  });

  it("rejects when the response is missing required keys (schema parse)", async () => {
    fetchMock.mockReturnValueOnce(jsonResponse({ success: true })); // missing fields
    await expect(
      createReservationsRequest({ clientProfileId: "c", sessionIds: ["s"] }),
    ).rejects.toThrow();
  });
});

describe("cancelReservationsBulkRequest", () => {
  beforeEach(() => fetchMock.mockReset());
  afterEach(() => vi.clearAllMocks());

  it("POSTs to /api/admin/reservations/cancel-bulk with the JSON body and parses the response", async () => {
    fetchMock.mockReturnValueOnce(
      jsonResponse({ success: true, canceled: 3, promotedUserIds: ["u1"] }),
    );
    const data = await cancelReservationsBulkRequest({
      bookingIds: ["b1", "b2", "b3"],
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://test.local/api/admin/reservations/cancel-bulk");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ bookingIds: ["b1", "b2", "b3"] }));
    expect(data.canceled).toBe(3);
    expect(data.promotedUserIds).toEqual(["u1"]);
  });
});
