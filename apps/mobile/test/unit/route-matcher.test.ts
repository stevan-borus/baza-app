import { describe, expect, it } from "vitest";
import { matchRoute, toRoutePattern, type RoutePattern } from "@/lib/server/route-matcher";

// A representative slice of the real app inventory, including the collisions
// that make precedence matter (static "availability" vs dynamic "[id]").
const KEYS = [
  "health",
  "sessions",
  "sessions/[id]",
  "sessions/availability",
  "sessions/recurring",
  "sessions/recurring/[id]",
  "clients",
  "clients/[id]",
  "clients/[id]/bookings",
  "clients/me/packages",
  "consent/status",
  "consent/social-media",
  "legal/documents",
  "legal/documents/[key]",
  "admin/clients/[id]/health",
  "campaigns/[id]",
  "campaigns/[id]/send",
  "campaigns/preview",
  "reports/utilization/by-room",
];

const patterns: RoutePattern[] = KEYS.map(toRoutePattern);

function match(pathname: string) {
  return matchRoute(pathname, patterns);
}

describe("toRoutePattern", () => {
  it("maps a static key to static segments", () => {
    expect(toRoutePattern("consent/status").segments).toEqual([
      { kind: "static", value: "consent" },
      { kind: "static", value: "status" },
    ]);
  });

  it("maps a bracket segment to a named param", () => {
    expect(toRoutePattern("sessions/[id]").segments).toEqual([
      { kind: "static", value: "sessions" },
      { kind: "param", name: "id" },
    ]);
  });

  it("rejects a deep-dynamic segment (owned by the catch-all, not the registry)", () => {
    expect(() => toRoutePattern("foo/[...rest]")).toThrow();
  });
});

describe("matchRoute — static vs dynamic precedence", () => {
  it("prefers the static route over the dynamic sibling", () => {
    // /api/sessions/availability must hit sessions/availability, NOT sessions/[id]
    expect(match("/api/sessions/availability")).toEqual({
      key: "sessions/availability",
      params: {},
    });
    expect(match("/api/sessions/recurring")).toEqual({
      key: "sessions/recurring",
      params: {},
    });
  });

  it("falls back to the dynamic route for a non-reserved value", () => {
    expect(match("/api/sessions/abc-123")).toEqual({
      key: "sessions/[id]",
      params: { id: "abc-123" },
    });
  });

  it("prefers a deeper static over a shorter dynamic when lengths differ", () => {
    // clients/me/packages (all static, 3 segs) vs clients/[id] (2 segs)
    expect(match("/api/clients/me/packages")).toEqual({
      key: "clients/me/packages",
      params: {},
    });
  });
});

describe("matchRoute — nested dynamic and multi-segment", () => {
  it("matches nested static-after-dynamic", () => {
    expect(match("/api/clients/xyz/bookings")).toEqual({
      key: "clients/[id]/bookings",
      params: { id: "xyz" },
    });
  });

  it("matches a param embedded between statics", () => {
    expect(match("/api/admin/clients/42/health")).toEqual({
      key: "admin/clients/[id]/health",
      params: { id: "42" },
    });
  });

  it("distinguishes campaigns/[id] from campaigns/[id]/send and campaigns/preview", () => {
    expect(match("/api/campaigns/c1")).toEqual({
      key: "campaigns/[id]",
      params: { id: "c1" },
    });
    expect(match("/api/campaigns/c1/send")).toEqual({
      key: "campaigns/[id]/send",
      params: { id: "c1" },
    });
    // "preview" is static, must NOT be captured as campaigns/[id]
    expect(match("/api/campaigns/preview")).toEqual({
      key: "campaigns/preview",
      params: {},
    });
  });

  it("matches a recurring dynamic id under a static prefix", () => {
    expect(match("/api/sessions/recurring/r9")).toEqual({
      key: "sessions/recurring/[id]",
      params: { id: "r9" },
    });
  });

  it("matches a param named other than 'id'", () => {
    expect(match("/api/legal/documents/terms")).toEqual({
      key: "legal/documents/[key]",
      params: { key: "terms" },
    });
    // static sibling still wins for the bare collection
    expect(match("/api/legal/documents")).toEqual({
      key: "legal/documents",
      params: {},
    });
  });
});

describe("matchRoute — single-segment and trailing slash", () => {
  it("matches a single static segment", () => {
    expect(match("/api/health")).toEqual({ key: "health", params: {} });
    expect(match("/api/sessions")).toEqual({ key: "sessions", params: {} });
  });

  it("treats a trailing slash the same as no trailing slash (expo parity)", () => {
    expect(match("/api/health/")).toEqual({ key: "health", params: {} });
    expect(match("/api/sessions/availability/")).toEqual({
      key: "sessions/availability",
      params: {},
    });
    expect(match("/api/sessions/abc/")).toEqual({
      key: "sessions/[id]",
      params: { id: "abc" },
    });
  });

  it("keeps a hyphenated static segment literal", () => {
    expect(match("/api/consent/social-media")).toEqual({
      key: "consent/social-media",
      params: {},
    });
    expect(match("/api/reports/utilization/by-room")).toEqual({
      key: "reports/utilization/by-room",
      params: {},
    });
  });
});

describe("matchRoute — non-matches", () => {
  it("returns null for an unknown /api path", () => {
    expect(match("/api/does-not-exist")).toBeNull();
    expect(match("/api/sessions/x/y/z")).toBeNull();
  });

  it("returns null for a non-/api path", () => {
    expect(match("/sign-in")).toBeNull();
    expect(match("/")).toBeNull();
    expect(match("/apix/health")).toBeNull();
  });

  it("returns null for bare /api", () => {
    expect(match("/api")).toBeNull();
    expect(match("/api/")).toBeNull();
  });

  it("does not let a dynamic segment swallow an empty segment", () => {
    // "/api/sessions//" would split to ["sessions",""] — no route matches an
    // empty dynamic value.
    expect(match("/api/sessions//")).toBeNull();
  });

  it("passes the raw (un-decoded) param value through, matching expo-server", () => {
    // expo-server's parseParams uses the raw regex capture — it does NOT decode.
    expect(match("/api/sessions/a%2Fb")).toEqual({
      key: "sessions/[id]",
      params: { id: "a%2Fb" },
    });
  });
});
