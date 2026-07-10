import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Verifies the fix that this refactor depends on: with several server bundles in
// one long-lived process, `globalThis` is the ONLY place a PrismaClient/pg Pool
// can be deduped across bundles. So the module must (a) cache on globalThis in
// ALL environments — including production — and (b) construct the Pool + client
// lazily inside the cache-miss path, so a second bundle importing the module
// reuses the first's instance instead of opening another pool.

const poolCtor = vi.fn();
const clientCtor = vi.fn();

vi.mock("pg", () => ({
  Pool: class {
    constructor(...args: unknown[]) {
      poolCtor(...args);
    }
  },
}));

vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: class {
    constructor(...args: unknown[]) {
      void args;
    }
  },
}));

vi.mock("@/generated/prisma", () => ({
  PrismaClient: class {
    // Tag each instance so identity comparisons are meaningful.
    readonly _id = Math.random();
    constructor(...args: unknown[]) {
      clientCtor(...args);
    }
  },
}));

vi.mock("@/lib/server/env", () => ({
  env: { DATABASE_URL: "postgresql://u:p@localhost:5432/db?schema=public" },
}));

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

beforeEach(() => {
  poolCtor.mockClear();
  clientCtor.mockClear();
  // Clear any cached singleton from a previous test.
  delete (globalThis as Record<string, unknown>).prisma;
  vi.resetModules();
});

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  delete (globalThis as Record<string, unknown>).prisma;
});

async function importPrisma() {
  const mod = await import("@/lib/server/prisma");
  return mod.prisma;
}

describe("prisma singleton — production", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "production";
  });

  it("caches on globalThis and returns the same instance across re-imports", async () => {
    const first = await importPrisma();
    vi.resetModules(); // simulate a second bundle importing the module fresh
    const second = await importPrisma();
    expect(second).toBe(first);
  });

  it("constructs only one Pool and one client across re-imports", async () => {
    await importPrisma();
    vi.resetModules();
    await importPrisma();
    expect(poolCtor).toHaveBeenCalledTimes(1);
    expect(clientCtor).toHaveBeenCalledTimes(1);
  });
});

describe("prisma singleton — non-production", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "development";
  });

  it("still caches on globalThis (single Pool across re-imports)", async () => {
    const first = await importPrisma();
    vi.resetModules();
    const second = await importPrisma();
    expect(second).toBe(first);
    expect(poolCtor).toHaveBeenCalledTimes(1);
  });
});
