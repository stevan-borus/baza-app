/**
 * Unit tests for `paramFromCtxOrUrl` — the helper that recovers a dynamic
 * route param when Expo Router fails to populate `ctx.params`. Regression
 * coverage for the bug that made `GET /api/admin/clients/[id]/consent-records`
 * crash with "Cannot read properties of undefined (reading 'id')", which
 * in turn made ClientLegalPanel render every doc as "Još nije prihvaćeno"
 * even when the client had accepted them.
 */
import { describe, it, expect } from "vitest";
import { paramFromCtxOrUrl } from "@/lib/server/http";

function req(path: string) {
  return new Request(`http://test.local${path}`);
}

describe("paramFromCtxOrUrl", () => {
  it("returns the ctx param when present", () => {
    const r = req("/api/admin/clients/abc/consent-records");
    const v = paramFromCtxOrUrl(r, { params: { id: "abc" } }, "id", "consent-records");
    expect(v).toBe("abc");
  });

  it("falls back to the URL segment when ctx is undefined", () => {
    const r = req("/api/admin/clients/abc/consent-records");
    const v = paramFromCtxOrUrl(r, undefined, "id", "consent-records");
    expect(v).toBe("abc");
  });

  it("falls back to URL when ctx.params is empty", () => {
    const r = req("/api/admin/clients/xyz/health");
    const v = paramFromCtxOrUrl(r, { params: {} }, "id", "health");
    expect(v).toBe("xyz");
  });

  it("returns the trailing segment when no afterSegment is given", () => {
    const r = req("/api/admin/clients/abc");
    const v = paramFromCtxOrUrl(r, undefined, "id");
    expect(v).toBe("abc");
  });

  it("returns undefined when the segment is missing", () => {
    const r = req("/api/some/other/path");
    const v = paramFromCtxOrUrl(r, undefined, "id", "consent-records");
    expect(v).toBeUndefined();
  });

  it("works for any segment name (e.g. guardian-verified)", () => {
    const r = req("/api/admin/clients/MINOR_ID/guardian-verified");
    const v = paramFromCtxOrUrl(r, undefined, "id", "guardian-verified");
    expect(v).toBe("MINOR_ID");
  });

  it("ignores ctx.params.id when it is null/empty string", () => {
    const r = req("/api/admin/clients/from-url/health");
    const v = paramFromCtxOrUrl(r, { params: { id: "" } }, "id", "health");
    expect(v).toBe("from-url");
  });
});
