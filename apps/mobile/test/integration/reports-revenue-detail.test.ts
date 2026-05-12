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
      if (!allowed.includes(user.role)) return { ok: false as const, response: fail("Forbidden", 403) };
      return { ok: true as const, user };
    },
    getRequestUser: async () => mod.getMockUser(),
  };
});

import { GET as GET_TIME_SERIES } from "@/app/api/reports/revenue/time-series/+api";
import { GET as GET_BY_PACKAGE_TYPE } from "@/app/api/reports/revenue/by-package-type/+api";
import { GET as GET_BY_METHOD } from "@/app/api/reports/revenue/by-method/+api";
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

function asTrainer() {
  setMockUser({
    id: "trainer-1",
    role: "TRAINER",
    email: "trainer@test.local",
    isActive: true,
    clientProfile: null,
  });
}

function req(path: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return new Request(`http://test.local${path}?${qs}`);
}

describe("reports/revenue/time-series", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("returns 7 daily buckets across a week-long window", async () => {
    asAdmin();
    const response = await GET_TIME_SERIES(
      req("/api/reports/revenue/time-series", {
        from: "2026-07-01T00:00:00Z",
        to: "2026-07-08T00:00:00Z",
        period: "week",
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      success: boolean;
      buckets: { bucketStart: string; bucketEnd: string; revenue: number; paymentCount: number }[];
    };
    expect(body.success).toBe(true);
    expect(body.buckets).toHaveLength(7);
    // First bucket aligned to from, each one UTC-day wide.
    expect(body.buckets[0].bucketStart).toBe("2026-07-01T00:00:00.000Z");
    expect(body.buckets[0].bucketEnd).toBe("2026-07-02T00:00:00.000Z");
    expect(body.buckets[6].bucketStart).toBe("2026-07-07T00:00:00.000Z");
    expect(body.buckets[6].bucketEnd).toBe("2026-07-08T00:00:00.000Z");
  });

  it("aggregates CONFIRMED payments into the correct daily bucket", async () => {
    const client = await prisma.user.create({
      data: { email: "c@test.local", fullName: "C", role: "CLIENT" },
    });
    // Two payments on day 1 (Jul 1) — 10000 + 5000.
    await prisma.billingRecord.create({
      data: {
        clientUserId: client.id,
        amount: 10000,
        method: "CASH",
        status: "CONFIRMED",
        createdAt: new Date("2026-07-01T09:00:00Z"),
      },
    });
    await prisma.billingRecord.create({
      data: {
        clientUserId: client.id,
        amount: 5000,
        method: "CASH",
        status: "CONFIRMED",
        createdAt: new Date("2026-07-01T18:00:00Z"),
      },
    });
    // One payment on day 3 (Jul 3) — 8000.
    await prisma.billingRecord.create({
      data: {
        clientUserId: client.id,
        amount: 8000,
        method: "CARD",
        status: "CONFIRMED",
        createdAt: new Date("2026-07-03T12:00:00Z"),
      },
    });
    // PR β removed PENDING/CANCELED from BillingStatus, so the historical
    // "must NOT count" guard row is no longer constructible. The API's
    // status=CONFIRMED filter is still in place as defense in depth in
    // case the enum ever grows again.

    asAdmin();
    const response = await GET_TIME_SERIES(
      req("/api/reports/revenue/time-series", {
        from: "2026-07-01T00:00:00Z",
        to: "2026-07-08T00:00:00Z",
        period: "week",
      }),
    );
    const body = (await response.json()) as {
      buckets: { revenue: number; paymentCount: number }[];
    };
    expect(body.buckets[0].revenue).toBe(15000);
    expect(body.buckets[0].paymentCount).toBe(2);
    expect(body.buckets[1].revenue).toBe(0);
    expect(body.buckets[2].revenue).toBe(8000);
    expect(body.buckets[2].paymentCount).toBe(1);
    expect(body.buckets[3].revenue).toBe(0);
  });

  it("emits monthly buckets when period=year", async () => {
    asAdmin();
    const response = await GET_TIME_SERIES(
      req("/api/reports/revenue/time-series", {
        from: "2026-01-01T00:00:00Z",
        to: "2027-01-01T00:00:00Z",
        period: "year",
      }),
    );
    const body = (await response.json()) as {
      buckets: { bucketStart: string; bucketEnd: string }[];
    };
    expect(body.buckets).toHaveLength(12);
    expect(body.buckets[0].bucketStart).toBe("2026-01-01T00:00:00.000Z");
    expect(body.buckets[0].bucketEnd).toBe("2026-02-01T00:00:00.000Z");
    expect(body.buckets[11].bucketStart).toBe("2026-12-01T00:00:00.000Z");
    expect(body.buckets[11].bucketEnd).toBe("2027-01-01T00:00:00.000Z");
  });

  it("is forbidden for TRAINER callers", async () => {
    asTrainer();
    const response = await GET_TIME_SERIES(
      req("/api/reports/revenue/time-series", {
        from: "2026-07-01T00:00:00Z",
        to: "2026-07-08T00:00:00Z",
        period: "week",
      }),
    );
    expect(response.status).toBe(403);
  });
});

describe("reports/revenue/by-package-type", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("groups CONFIRMED payments by PackageType, sorts desc, and ignores anonymous rows", async () => {
    const client = await prisma.user.create({
      data: { email: "c@test.local", fullName: "C", role: "CLIENT" },
    });
    const reformer = await prisma.classType.create({
      data: { name: "Reformer", maxClients: 6, durationMins: 60 },
    });
    const pt12 = await prisma.packageType.create({
      data: {
        name: "Reformer 12",
        sessionCount: 12,
        validityDays: 30,
        lateCancelHours: 12,
        classTypeId: reformer.id,
      },
    });
    const pt8 = await prisma.packageType.create({
      data: {
        name: "Reformer 8",
        sessionCount: 8,
        validityDays: 30,
        lateCancelHours: 12,
        classTypeId: reformer.id,
      },
    });
    const at = new Date("2026-07-15T10:00:00Z");
    // pt8: two confirmed (5000 + 7000) — bigger total.
    await prisma.billingRecord.create({
      data: {
        clientUserId: client.id,
        amount: 5000,
        method: "CASH",
        status: "CONFIRMED",
        packageTypeId: pt8.id,
        createdAt: at,
      },
    });
    await prisma.billingRecord.create({
      data: {
        clientUserId: client.id,
        amount: 7000,
        method: "CARD",
        status: "CONFIRMED",
        packageTypeId: pt8.id,
        createdAt: at,
      },
    });
    // pt12: one confirmed (10000).
    await prisma.billingRecord.create({
      data: {
        clientUserId: client.id,
        amount: 10000,
        method: "CASH",
        status: "CONFIRMED",
        packageTypeId: pt12.id,
        createdAt: at,
      },
    });
    // Anonymous payment — must be excluded.
    await prisma.billingRecord.create({
      data: {
        clientUserId: client.id,
        amount: 99999,
        method: "CASH",
        status: "CONFIRMED",
        packageTypeId: null,
        createdAt: at,
      },
    });

    asAdmin();
    const response = await GET_BY_PACKAGE_TYPE(
      req("/api/reports/revenue/by-package-type", {
        from: "2026-07-01T00:00:00Z",
        to: "2026-08-01T00:00:00Z",
      }),
    );
    const body = (await response.json()) as {
      rows: { packageTypeId: string; packageTypeName: string; revenue: number; paymentCount: number }[];
    };
    expect(body.rows).toEqual([
      { packageTypeId: pt8.id, packageTypeName: "Reformer 8", revenue: 12000, paymentCount: 2 },
      { packageTypeId: pt12.id, packageTypeName: "Reformer 12", revenue: 10000, paymentCount: 1 },
    ]);
  });

  it("is forbidden for TRAINER callers", async () => {
    asTrainer();
    const response = await GET_BY_PACKAGE_TYPE(
      req("/api/reports/revenue/by-package-type", {
        from: "2026-07-01T00:00:00Z",
        to: "2026-08-01T00:00:00Z",
      }),
    );
    expect(response.status).toBe(403);
  });
});

describe("reports/revenue/by-method", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("groups CONFIRMED payments by PaymentMethod and sorts desc", async () => {
    const client = await prisma.user.create({
      data: { email: "c@test.local", fullName: "C", role: "CLIENT" },
    });
    const at = new Date("2026-07-15T10:00:00Z");
    // CARD: 8000 (single biggest)
    await prisma.billingRecord.create({
      data: {
        clientUserId: client.id,
        amount: 8000,
        method: "CARD",
        status: "CONFIRMED",
        createdAt: at,
      },
    });
    // CASH: 3000 + 2500 = 5500
    await prisma.billingRecord.create({
      data: {
        clientUserId: client.id,
        amount: 3000,
        method: "CASH",
        status: "CONFIRMED",
        createdAt: at,
      },
    });
    await prisma.billingRecord.create({
      data: {
        clientUserId: client.id,
        amount: 2500,
        method: "CASH",
        status: "CONFIRMED",
        createdAt: at,
      },
    });
    // COMPANY: 1000 (smallest)
    await prisma.billingRecord.create({
      data: {
        clientUserId: client.id,
        amount: 1000,
        method: "COMPANY",
        status: "CONFIRMED",
        createdAt: at,
      },
    });

    // PR β removed PaymentMethod.QR and BillingStatus.PENDING/CANCELED, so
    // there's no longer a "must NOT count" canceled row to seed — every row
    // in the table is CONFIRMED by construction. The by-method API still
    // filters where status=CONFIRMED for defense in depth and to keep the
    // contract intact if the enum ever grows again.

    asAdmin();
    const response = await GET_BY_METHOD(
      req("/api/reports/revenue/by-method", {
        from: "2026-07-01T00:00:00Z",
        to: "2026-08-01T00:00:00Z",
      }),
    );
    const body = (await response.json()) as {
      rows: { method: string; revenue: number; paymentCount: number }[];
    };
    expect(body.rows).toEqual([
      { method: "CARD", revenue: 8000, paymentCount: 1 },
      { method: "CASH", revenue: 5500, paymentCount: 2 },
      { method: "COMPANY", revenue: 1000, paymentCount: 1 },
    ]);
  });

  it("is forbidden for TRAINER callers", async () => {
    asTrainer();
    const response = await GET_BY_METHOD(
      req("/api/reports/revenue/by-method", {
        from: "2026-07-01T00:00:00Z",
        to: "2026-08-01T00:00:00Z",
      }),
    );
    expect(response.status).toBe(403);
  });
});
