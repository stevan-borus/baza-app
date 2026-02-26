import { PrismaClient } from "@/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { env } from "@/lib/server/env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const pool = new Pool({
  connectionString:
    env.DATABASE_URL ||
    "postgresql://user:pass@localhost:5432/baza?schema=public",
});
const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
