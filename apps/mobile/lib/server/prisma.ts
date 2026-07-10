import { PrismaClient } from "@/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { env } from "@/lib/server/env";

// Cache on globalThis in ALL environments — including production.
//
// After the API-route consolidation the server still ships ~3 API bundles
// (middleware, the better-auth catch-all, and our [...rest] catch-all), each a
// separate Metro module graph with its OWN copy of this module. Module-scope
// `const` dedup only works within one graph; across graphs in the same Node
// process, `globalThis` is the only shared slot. Without prod caching each
// bundle would open its own pg Pool + PrismaClient on first hit — the very
// per-bundle retention this refactor exists to kill. (In dev the same cache also
// survives Metro hot-reloads, its original reason for existing.)
//
// The Pool + adapter + client are constructed lazily inside the cache-miss path,
// not at module scope, so the second bundle to import this module reuses the
// first's instances instead of building a throwaway Pool it then discards.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrisma(): PrismaClient {
  const pool = new Pool({
    connectionString:
      env.DATABASE_URL || "postgresql://user:pass@localhost:5432/baza?schema=public",
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log: ["warn", "error"],
  });
}

export const prisma = (globalForPrisma.prisma ??= createPrisma());
