import { afterEach, describe, expect, it, vi } from "vitest";
import { API_RATE_LIMIT } from "@/lib/server/rate-limit";

// The throttle lives in the middleware because that is the one place every API
// path passes through: both the better-auth catch-all and our dispatcher sit
// behind it. These tests drive the real middleware with the consent gate off,
// so the only thing that can answer 429 is the limiter.
vi.mock("@/lib/server/env.server", () => ({
  rateLimitEnabled: true,
  consentGateEnabled: false,
  serverEnv: {},
}));
vi.mock("@/lib/server/auth-guards", () => ({
  getRequestUser: vi.fn(async () => null),
}));
vi.mock("@/lib/legal/consent-status", () => ({
  getConsentStatus: vi.fn(async () => ({ pending: [] })),
}));

const middleware = (await import("@/app/+middleware")).default;

// Each test needs a fresh limiter: the singleton is cached on globalThis and
// one exhausted IP would bleed into the next test.
afterEach(() => {
  delete (globalThis as Record<string, unknown>).apiRateLimiter;
  vi.resetModules();
});

function req(path: string, ip: string) {
  return new Request(`http://test.local${path}`, {
    headers: { "fly-client-ip": ip },
  }) as unknown as Parameters<typeof middleware>[0];
}

describe("api middleware — per-IP throttle", () => {
  it("lets the full allowance through untouched", async () => {
    const fresh = (await import("@/app/+middleware")).default;
    for (let i = 0; i < API_RATE_LIMIT; i++) {
      const res = await fresh(req("/api/sessions", "1.1.1.1"));
      expect(res).toBeUndefined();
    }
  });

  it("answers 429 with a Retry-After header once the allowance is spent", async () => {
    const fresh = (await import("@/app/+middleware")).default;
    for (let i = 0; i < API_RATE_LIMIT; i++) {
      await fresh(req("/api/sessions", "2.2.2.2"));
    }
    const res = await fresh(req("/api/sessions", "2.2.2.2"));
    expect(res).toBeInstanceOf(Response);
    const throttled = res as Response;
    expect(throttled.status).toBe(429);
    expect(Number(throttled.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(await throttled.json()).toMatchObject({ error: "Too many requests" });
  });

  it("throttles per IP — a different caller is unaffected", async () => {
    const fresh = (await import("@/app/+middleware")).default;
    for (let i = 0; i < API_RATE_LIMIT + 1; i++) {
      await fresh(req("/api/sessions", "3.3.3.3"));
    }
    expect(await fresh(req("/api/sessions", "3.3.3.3"))).toBeInstanceOf(
      Response,
    );
    expect(await fresh(req("/api/sessions", "4.4.4.4"))).toBeUndefined();
  });

  // Fly's health check hits this every 15s from the proxy's own address. If it
  // could be throttled, a burst from one shared IP would take the machine out
  // of rotation.
  it("never throttles /api/health", async () => {
    const fresh = (await import("@/app/+middleware")).default;
    for (let i = 0; i < API_RATE_LIMIT + 50; i++) {
      const res = await fresh(req("/api/health", "5.5.5.5"));
      expect(res).toBeUndefined();
    }
  });

  it("does not throttle non-API paths", async () => {
    const fresh = (await import("@/app/+middleware")).default;
    for (let i = 0; i < API_RATE_LIMIT + 10; i++) {
      const res = await fresh(req("/(client)/home", "6.6.6.6"));
      expect(res).toBeUndefined();
    }
  });
});
