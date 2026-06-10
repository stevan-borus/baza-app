/**
 * Unit tests for the typed fetch seam (lib/api-request.ts) — the one module
 * that owns URL building (ADR-0003 baked in), cookie-injecting transport,
 * ApiError shaping, and optional Zod response validation.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/env.shared", () => ({
  sharedEnv: { EXPO_PUBLIC_API_URL: "http://test.local" },
}));

// Sever the react-native import chain (lib/api → react-native) and capture
// every outgoing request — the seam routes all transport through apiFetch.
const fetchMock = vi.fn();
vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => fetchMock(...args),
}));

import { z } from "zod";
import { ApiError } from "@/lib/api-error";
import { apiRequest, buildApiUrl } from "@/lib/api-request";

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }) {
  return Promise.resolve({
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => body,
  });
}

describe("buildApiUrl — ADR-0003 query-string semantics", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("returns the bare endpoint when no params are given", () => {
    expect(buildApiUrl("http://test.local/api/billing")).toBe(
      "http://test.local/api/billing",
    );
  });

  it("appends present string params, URL-encoded", () => {
    expect(
      buildApiUrl("http://test.local/api/clients", { q: "ana marić", take: "20" }),
    ).toBe("http://test.local/api/clients?q=ana+mari%C4%87&take=20");
  });

  it("omits falsy params (undefined, null, empty string, 0, false) — call sites only ever .set() truthy values", () => {
    expect(
      buildApiUrl("http://test.local/api/billing", {
        cursor: undefined,
        clientUserId: null,
        from: "",
        limit: 0,
        active: false,
        to: "2026-06-30",
      }),
    ).toBe("http://test.local/api/billing?to=2026-06-30");
  });

  it("returns the bare endpoint when every param is absent — no trailing '?'", () => {
    expect(
      buildApiUrl("http://test.local/api/reports/summary", {
        from: undefined,
        to: undefined,
      }),
    ).toBe("http://test.local/api/reports/summary");
  });

  it("stringifies truthy numbers", () => {
    expect(
      buildApiUrl("http://test.local/api/clients", { take: 50 }),
    ).toBe("http://test.local/api/clients?take=50");
  });

  it("joins array params with commas and omits empty arrays (trainer-notes multi-select)", () => {
    expect(
      buildApiUrl("http://test.local/api/trainer-notes", {
        sessionIds: ["s1", "s2"],
        clientProfileIds: [],
      }),
    ).toBe("http://test.local/api/trainer-notes?sessionIds=s1%2Cs2");
  });

  it("ADR-0003: still emits the query string when URLSearchParams.size is undefined (RN polyfill)", () => {
    // RN's URLSearchParams polyfill silently returns undefined for `.size`.
    // Simulate it: any logic that gates on `size > 0` would drop the params.
    const Original = globalThis.URLSearchParams;
    class PolyfillLike extends Original {
      // @ts-expect-error — deliberately mimic the broken polyfill
      get size() {
        return undefined;
      }
    }
    globalThis.URLSearchParams = PolyfillLike as unknown as typeof URLSearchParams;
    try {
      expect(
        buildApiUrl("http://test.local/api/billing", { from: "2026-06-01" }),
      ).toBe("http://test.local/api/billing?from=2026-06-01");
      expect(buildApiUrl("http://test.local/api/billing", {})).toBe(
        "http://test.local/api/billing",
      );
    } finally {
      globalThis.URLSearchParams = Original;
    }
  });
});

describe("apiRequest — transport, validation, error shaping", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("GETs the built URL through apiFetch with credentials include and parses with the given schema", async () => {
    fetchMock.mockReturnValueOnce(
      jsonResponse({ success: true, records: [], extraneous: "stripped" }),
    );
    const schema = z.object({ success: z.boolean(), records: z.array(z.string()) });
    const data = await apiRequest("/api/billing", {
      params: { cursor: "abc", from: undefined },
      schema,
      errorMessage: "Unable to load billing",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://test.local/api/billing?cursor=abc");
    expect(init.credentials).toBe("include");
    // schema.parse applied: unknown keys stripped
    expect(data).toEqual({ success: true, records: [] });
  });

  it("throws ApiError carrying status + body, with the server's `error` field as the message", async () => {
    fetchMock.mockReturnValueOnce(
      jsonResponse(
        { success: false, error: "Schedule conflict", details: { sessionId: "s1" } },
        { ok: false, status: 409 },
      ),
    );
    const err = await apiRequest("/api/sessions", {
      errorMessage: "Unable to create session",
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.status).toBe(409);
    expect(apiErr.message).toBe("Schedule conflict");
    expect(apiErr.body).toEqual({
      success: false,
      error: "Schedule conflict",
      details: { sessionId: "s1" },
    });
  });

  it("falls back to `errorMessage (status)` when the failure body is not JSON", async () => {
    fetchMock.mockReturnValueOnce(
      Promise.resolve({
        ok: false,
        status: 502,
        json: async () => {
          throw new SyntaxError("not json");
        },
      }),
    );
    const err = await apiRequest("/api/billing", {
      errorMessage: "Unable to load billing",
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe("Unable to load billing (502)");
    expect((err as ApiError).body).toBeNull();
  });

  it("propagates schema parse failures on an ok response", async () => {
    fetchMock.mockReturnValueOnce(jsonResponse({ success: "yes" }));
    await expect(
      apiRequest("/api/billing", {
        schema: z.object({ success: z.boolean() }),
        errorMessage: "Unable to load billing",
      }),
    ).rejects.toThrow(z.ZodError);
  });

  it("returns the raw JSON when no schema is given", async () => {
    fetchMock.mockReturnValueOnce(jsonResponse({ anything: "goes" }));
    const data = await apiRequest("/api/notifications/1", {
      method: "PATCH",
      errorMessage: "Unable to mark notification as read",
    });
    expect(data).toEqual({ anything: "goes" });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("PATCH");
    expect(init.body).toBeUndefined();
  });

  it("JSON-encodes a body with content-type header", async () => {
    fetchMock.mockReturnValueOnce(jsonResponse({ success: true }));
    await apiRequest("/api/auth/complete-invite", {
      method: "POST",
      body: { token: "tok", password: "pw", name: "Ana" },
      errorMessage: "Failed",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://test.local/api/auth/complete-invite");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(init.body).toBe(JSON.stringify({ token: "tok", password: "pw", name: "Ana" }));
  });
});
