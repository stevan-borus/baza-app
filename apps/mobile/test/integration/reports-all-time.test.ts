/**
 * "Sve vreme" / All-time pill — verifies report endpoints handle a missing
 * `from`/`to` pair without 400-ing and without silently restricting to the
 * old 30-day fallback. The summary aggregate must cover every row; the
 * revenue time-series must switch to yearly buckets so the chart scales as
 * the studio ages.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => {
  const { fail } = await import("@/lib/server/http");
  const mod = await import("./auth-mock");
  return {
    requireRole: async (_req: Request, allowed: string[]) => {
      const user = mod.getMockUser();
      if (!user) return { ok: false as const, response: fail("Unauthorized", 401) };
      if (!allowed.includes(user.role))
        return { ok: false as const, response: fail("Forbidden", 403) };
      return { ok: true as const, user };
    },
    getRequestUser: async () => mod.getMockUser(),
  };
});

import { GET as GET_SUMMARY } from "@/app/api/reports/summary/+api";
import { GET as GET_REVENUE_TIME_SERIES } from "@/app/api/reports/revenue/time-series/+api";
import { prisma } from "@/lib/server/prisma";

function asAdmin() {
  setMockUser({
    id: "admin-1",
    role: "ADMIN",
    email: "admin@test.local",
    isActive: true,
    clientProfile: null,
  });
}

describe("reports — all-time pill (no from/to)", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("summary covers every CONFIRMED payment regardless of age", async () => {
    const client = await prisma.user.create({
      data: { email: "c@test.local", firstName: "C", lastName: "Test", role: "CLIENT" },
    });
    // One payment from years ago, one from this year — both should count.
    await prisma.billingRecord.create({
      data: {
        clientUserId: client.id,
        amount: 1000,
        method: "CASH",
        status: "CONFIRMED",
        createdAt: new Date("2023-04-01T09:00:00Z"),
      },
    });
    await prisma.billingRecord.create({
      data: {
        clientUserId: client.id,
        amount: 4500,
        method: "CASH",
        status: "CONFIRMED",
        createdAt: new Date("2026-02-10T09:00:00Z"),
      },
    });

    asAdmin();
    const response = await GET_SUMMARY(
      new Request("http://test.local/api/reports/summary"),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      summary: { revenue: number; totalPayments: number };
    };
    expect(body.summary.revenue).toBe(5500);
    expect(body.summary.totalPayments).toBe(2);
  });

  it("revenue time-series returns yearly buckets spanning earliest payment to now", async () => {
    const client = await prisma.user.create({
      data: { email: "c@test.local", firstName: "C", lastName: "Test", role: "CLIENT" },
    });
    await prisma.billingRecord.create({
      data: {
        clientUserId: client.id,
        amount: 1000,
        method: "CASH",
        status: "CONFIRMED",
        createdAt: new Date("2024-04-01T09:00:00Z"),
      },
    });
    await prisma.billingRecord.create({
      data: {
        clientUserId: client.id,
        amount: 4500,
        method: "CASH",
        status: "CONFIRMED",
        createdAt: new Date("2026-02-10T09:00:00Z"),
      },
    });

    asAdmin();
    const response = await GET_REVENUE_TIME_SERIES(
      new Request("http://test.local/api/reports/revenue/time-series"),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      buckets: Array<{ bucketStart: string; bucketEnd: string; revenue: number; paymentCount: number }>;
    };
    // Earliest payment is 2024 — expect a yearly bucket starting at 2024,
    // followed by 2025 and 2026 (now). Each bucket starts on Jan 1 UTC.
    expect(body.buckets.length).toBeGreaterThanOrEqual(3);
    expect(body.buckets[0].bucketStart).toBe("2024-01-01T00:00:00.000Z");
    expect(body.buckets[0].revenue).toBe(1000);
    // Find the 2026 bucket and check it includes the 4500 payment.
    const y2026 = body.buckets.find((b) => b.bucketStart.startsWith("2026-"));
    expect(y2026).toBeDefined();
    expect(y2026?.revenue).toBe(4500);
  });
});
