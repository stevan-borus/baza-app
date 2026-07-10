import { afterEach, describe, expect, it, vi } from "vitest";

// expo-router routes ALL /api/auth/* to the better-auth catch-all
// (app/api/auth/[...all]/+api.ts) because it's ordered before /api/[...rest].
// So the auth catch-all must itself hand our moved auth app-routes
// (/api/auth/me, /api/auth/sign-in, ...) back to the dispatcher, and only call
// better-auth's handler for the paths better-auth owns. These tests pin that.

const dispatch = vi.fn(async () => new Response("app-route", { status: 200 }));
const authHandler = vi.fn(async () => new Response("better-auth", { status: 200 }));

// Our moved auth app-routes live in the registry; better-auth paths do not.
const REGISTERED = new Set([
  "/api/auth/me",
  "/api/auth/sign-in",
  "/api/auth/sign-out",
  "/api/auth/complete-invite",
  "/api/auth/reset-password",
  "/api/auth/request-password-reset",
]);

vi.mock("@/server/dispatch", () => ({
  dispatch,
  isRegisteredRoute: (pathname: string) => REGISTERED.has(pathname),
}));

vi.mock("@/lib/server/auth", () => ({
  auth: { handler: authHandler },
}));

const route = await import("@/app/api/auth/[...all]/+api");

function req(path: string, method: string) {
  return new Request(`http://test.local${path}`, { method });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("auth catch-all — delegates moved app-routes to the dispatcher", () => {
  it("routes GET /api/auth/me to the dispatcher, not better-auth", async () => {
    const res = await route.GET(req("/api/auth/me", "GET"));
    expect(await res.text()).toBe("app-route");
    expect(dispatch).toHaveBeenCalledOnce();
    expect(authHandler).not.toHaveBeenCalled();
  });

  it("routes POST /api/auth/sign-in to the dispatcher", async () => {
    const res = await route.POST(req("/api/auth/sign-in", "POST"));
    expect(await res.text()).toBe("app-route");
    expect(dispatch).toHaveBeenCalledOnce();
    expect(authHandler).not.toHaveBeenCalled();
  });

  it("routes POST /api/auth/sign-out (app route) to the dispatcher", async () => {
    const res = await route.POST(req("/api/auth/sign-out", "POST"));
    expect(await res.text()).toBe("app-route");
    expect(dispatch).toHaveBeenCalledOnce();
  });
});

describe("auth catch-all — falls through to better-auth for its own paths", () => {
  it("routes GET /api/auth/get-session to better-auth", async () => {
    const res = await route.GET(req("/api/auth/get-session", "GET"));
    expect(await res.text()).toBe("better-auth");
    expect(authHandler).toHaveBeenCalledOnce();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("routes POST /api/auth/sign-in/email (better-auth) to better-auth", async () => {
    const res = await route.POST(req("/api/auth/sign-in/email", "POST"));
    expect(await res.text()).toBe("better-auth");
    expect(authHandler).toHaveBeenCalledOnce();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
