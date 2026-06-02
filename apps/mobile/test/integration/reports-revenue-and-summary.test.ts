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

import { GET as GET_REVENUE } from "@/app/api/reports/revenue/+api";
import { GET as GET_SUMMARY } from "@/app/api/reports/summary/+api";
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

function asClient() {
  setMockUser({
    id: "client-1",
    role: "CLIENT",
    email: "client@test.local",
    isActive: true,
    clientProfile: { id: "p" },
  });
}

describe("reports/revenue", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("aggregates CONFIRMED payments per day bucket and excludes other statuses", async () => {
    const client = await prisma.user.create({
      data: { email: "c@test.local", firstName: "C", lastName: "Test", role: "CLIENT" },
    });
    await prisma.billingRecord.create({
      data: {
        clientUserId: client.id,
        amount: 1000,
        method: "CASH",
        status: "CONFIRMED",
        createdAt: new Date("2026-07-15T09:00:00Z"),
      },
    });
    await prisma.billingRecord.create({
      data: {
        clientUserId: client.id,
        amount: 2000,
        method: "CASH",
        status: "CONFIRMED",
        createdAt: new Date("2026-07-15T17:00:00Z"),
      },
    });
    // PR β removed PENDING/CANCELED from BillingStatus, so the previously-
    // seeded "must NOT count" PENDING row is no longer constructible. The
    // API's status=CONFIRMED filter is still in place as defense in depth.

    asAdmin();
    const response = await GET_REVENUE(
      new Request(
        "http://test.local/api/reports/revenue?from=2026-07-01&to=2026-08-01&period=day",
      ),
    );
    const body = (await response.json()) as {
      data: { period: string; revenue: number; count: number }[];
    };
    expect(body.data).toEqual([
      { period: "2026-07-15", revenue: 3000, count: 2 },
    ]);
  });

  it("excludes payments outside the from-to window", async () => {
    const client = await prisma.user.create({
      data: { email: "c2@test.local", firstName: "C2", lastName: "Test", role: "CLIENT" },
    });
    await prisma.billingRecord.create({
      data: {
        clientUserId: client.id,
        amount: 1000,
        method: "CASH",
        status: "CONFIRMED",
        createdAt: new Date("2026-06-15T09:00:00Z"),
      },
    });

    asAdmin();
    const response = await GET_REVENUE(
      new Request(
        "http://test.local/api/reports/revenue?from=2026-07-01&to=2026-08-01&period=day",
      ),
    );
    const body = (await response.json()) as { data: unknown[] };
    expect(body.data).toEqual([]);
  });

  it("is forbidden for client callers", async () => {
    asClient();
    const response = await GET_REVENUE(
      new Request(
        "http://test.local/api/reports/revenue?from=2026-07-01&to=2026-08-01&period=day",
      ),
    );
    expect(response.status).toBe(403);
  });
});

describe("reports/summary", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("returns totals across clients, sessions, and CONFIRMED revenue", async () => {
    const trainer = await prisma.user.create({
      data: { email: "t@test.local", firstName: "T", lastName: "Test", role: "TRAINER" },
    });
    const reformer = await prisma.classType.create({
      data: { name: "Reformer", maxClients: 6, durationMins: 60 },
    });
    const active = await prisma.user.create({
      data: { email: "a@test.local", firstName: "A", lastName: "Test", role: "CLIENT", isActive: true },
    });
    await prisma.clientProfile.create({ data: { userId: active.id } });
    const inactive = await prisma.user.create({
      data: {
        email: "i@test.local",
        firstName: "I",
        lastName: "Test",
        role: "CLIENT",
        isActive: false,
      },
    });
    await prisma.clientProfile.create({ data: { userId: inactive.id } });

    await prisma.session.create({
      data: {
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt: new Date("2026-07-15T10:00:00Z"),
        endsAt: new Date("2026-07-15T11:00:00Z"),
        capacity: 6,
        isActive: true,
        status: "SCHEDULED",
      },
    });

    await prisma.billingRecord.create({
      data: {
        clientUserId: active.id,
        amount: 5000,
        method: "CASH",
        status: "CONFIRMED",
      },
    });
    // PR β removed PENDING from BillingStatus; the historical "must NOT
    // count" guard row is no longer constructible.

    asAdmin();
    const response = await GET_SUMMARY(
      new Request("http://test.local/api/reports/summary"),
    );
    const body = (await response.json()) as {
      summary: {
        totalClients: number;
        activeClients: number;
        inactiveClients: number;
        totalSessions: number;
        revenue: number;
        totalPayments: number;
      };
    };
    expect(body.summary).toEqual({
      totalClients: 2,
      activeClients: 1,
      inactiveClients: 1,
      totalSessions: 1,
      revenue: 5000,
      totalPayments: 1,
    });
  });

  it("is forbidden for client callers", async () => {
    asClient();
    const response = await GET_SUMMARY(
      new Request("http://test.local/api/reports/summary"),
    );
    expect(response.status).toBe(403);
  });
});
