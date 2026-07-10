import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the generated registry with a small, controlled table so the dispatcher
// test is independent of the real route inventory. The keys exercise a static
// route, a dynamic route, and a static-vs-dynamic collision.
const getSessions = vi.fn(
  (_req: Request, _params: Record<string, string>) => new Response("sessions-list", { status: 200 })
);
const getSession = vi.fn(
  (_req: Request, params: Record<string, string>) =>
    new Response(`session-${params.id}`, { status: 200 })
);
const getAvailability = vi.fn(
  (_req: Request, _params: Record<string, string>) => new Response("availability", { status: 200 })
);

vi.mock("@/server/routes-registry", () => ({
  routesRegistry: {
    sessions: { GET: getSessions },
    "sessions/[id]": { GET: getSession, DELETE: getSession },
    "sessions/availability": { GET: getAvailability },
  },
}));

const { dispatch } = await import("@/server/dispatch");

function req(path: string, method = "GET") {
  return new Request(`http://test.local${path}`, { method });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("dispatch — routing", () => {
  it("routes a static path to its handler", async () => {
    const res = await dispatch(req("/api/sessions"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("sessions-list");
    expect(getSessions).toHaveBeenCalledOnce();
  });

  it("routes a dynamic path and passes decoded-parity params", async () => {
    const res = await dispatch(req("/api/sessions/abc-123"));
    expect(await res.text()).toBe("session-abc-123");
    const [, params] = getSession.mock.calls[0];
    expect(params).toEqual({ id: "abc-123" });
  });

  it("prefers the static sibling over the dynamic route", async () => {
    const res = await dispatch(req("/api/sessions/availability"));
    expect(await res.text()).toBe("availability");
    expect(getAvailability).toHaveBeenCalledOnce();
    expect(getSession).not.toHaveBeenCalled();
  });

  it("passes the Request through to the handler", async () => {
    const request = req("/api/sessions");
    await dispatch(request);
    expect(getSessions.mock.calls[0][0]).toBe(request);
  });
});

describe("dispatch — 404 (expo-server parity)", () => {
  it("returns text/plain 'Not found' for an unmatched /api path", async () => {
    const res = await dispatch(req("/api/nope"));
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toBe("text/plain");
    expect(await res.text()).toBe("Not found");
  });

  it("returns 404 (never throws) for a stray /api/auth/* path", async () => {
    // expo-router routes /api/auth/* to the better-auth catch-all before us;
    // if one slips through it must 404 defensively, not crash.
    const res = await dispatch(req("/api/auth/whatever"));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not found");
  });

  it("returns 404 for a non-/api path", async () => {
    const res = await dispatch(req("/sign-in"));
    expect(res.status).toBe(404);
  });
});

describe("dispatch — 405 (expo-server parity)", () => {
  it("returns text/plain 'Method not allowed' when the method isn't exported", async () => {
    // sessions/[id] has GET + DELETE but no POST.
    const res = await dispatch(req("/api/sessions/x", "POST"));
    expect(res.status).toBe(405);
    expect(res.headers.get("content-type")).toBe("text/plain");
    expect(await res.text()).toBe("Method not allowed");
  });

  it("does not 405 a supported non-GET method", async () => {
    const res = await dispatch(req("/api/sessions/x", "DELETE"));
    expect(res.status).toBe(200);
    expect(getSession).toHaveBeenCalledOnce();
  });
});
