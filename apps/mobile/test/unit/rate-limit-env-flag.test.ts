import { afterEach, describe, expect, it, vi } from "vitest";

// BAZA_RATE_LIMIT_ENABLED defaults to "on in production, off everywhere else",
// which is the only reason e2e can run 4 Playwright workers off one loopback
// address without tripping the limiter.
//
// The trap this pins: zod applies `.default()` to an `undefined` input BEFORE
// the preprocess runs. Writing the flag as
// `z.preprocess(...).default(false)` therefore makes the NODE_ENV branch
// unreachable and ships production with the throttle silently off — the
// failure mode that looks fine in every test and only shows up as an
// un-throttled API. env.server.ts deliberately has no `.default()` on this
// field; this test fails if one comes back.
//
// env.server.ts parses at module scope, so each case needs a fresh module
// registry with the env staged first.
const REQUIRED_ENV = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  RESEND_API_KEY: "re_test",
  EXPO_ACCESS_TOKEN: "tok",
  API_ADMIN_BOOTSTRAP_TOKEN: "boot",
  BETTER_AUTH_SECRET: "0123456789abcdef",
  BASE_URL: "http://localhost:3010",
};

async function loadFlag(
  nodeEnv: string,
  raw: string | undefined,
): Promise<boolean> {
  vi.resetModules();
  for (const [k, v] of Object.entries(REQUIRED_ENV)) vi.stubEnv(k, v);
  vi.stubEnv("NODE_ENV", nodeEnv);
  if (raw === undefined) vi.stubEnv("BAZA_RATE_LIMIT_ENABLED", undefined);
  else vi.stubEnv("BAZA_RATE_LIMIT_ENABLED", raw);
  return (await import("@/lib/server/env.server")).rateLimitEnabled;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("BAZA_RATE_LIMIT_ENABLED", () => {
  it("defaults to ON in production when unset", async () => {
    expect(await loadFlag("production", undefined)).toBe(true);
  });

  it("defaults to OFF in development when unset", async () => {
    expect(await loadFlag("development", undefined)).toBe(false);
  });

  it("defaults to OFF under test when unset — e2e workers share one IP", async () => {
    expect(await loadFlag("test", undefined)).toBe(false);
  });

  it('respects an explicit "false" in production', async () => {
    expect(await loadFlag("production", "false")).toBe(false);
  });

  it('respects an explicit "true" in development', async () => {
    expect(await loadFlag("development", "true")).toBe(true);
  });
});
