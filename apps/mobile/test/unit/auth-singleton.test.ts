import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Same globalThis dedup as prisma, for the same reason: with multiple server
// bundles in one process each has its own copy of lib/server/auth.ts, and
// betterAuth() builds a non-trivial instance (adapter, plugins, crypto) at
// module scope. Cache it on globalThis so a second bundle reuses the first's.

const betterAuthCtor = vi.fn();

vi.mock("better-auth", () => ({
  betterAuth: (opts: unknown) => {
    betterAuthCtor(opts);
    return { _id: Math.random(), handler: () => new Response(null) };
  },
}));
vi.mock("better-auth/adapters/prisma", () => ({
  prismaAdapter: () => ({}),
}));
vi.mock("better-auth/api", () => ({
  createAuthMiddleware: (fn: unknown) => fn,
}));
vi.mock("@better-auth/expo", () => ({ expo: () => ({}) }));
vi.mock("@/lib/server/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/server/password", () => ({
  hashPassword: () => "",
  verifyPassword: () => true,
}));
vi.mock("@/lib/server/env", () => ({
  env: {
    BASE_URL: "http://localhost",
    APP_WEB_URL: "http://localhost",
    BETTER_AUTH_SECRET: "secret",
  },
}));

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

beforeEach(() => {
  betterAuthCtor.mockClear();
  delete (globalThis as Record<string, unknown>).auth;
  process.env.NODE_ENV = "production";
  vi.resetModules();
});

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  delete (globalThis as Record<string, unknown>).auth;
});

async function importAuth() {
  return (await import("@/lib/server/auth")).auth;
}

describe("auth singleton — production", () => {
  it("returns the same instance across re-imports (bundle boundary)", async () => {
    const first = await importAuth();
    vi.resetModules();
    const second = await importAuth();
    expect(second).toBe(first);
  });

  it("constructs betterAuth only once across re-imports", async () => {
    await importAuth();
    vi.resetModules();
    await importAuth();
    expect(betterAuthCtor).toHaveBeenCalledTimes(1);
  });
});
