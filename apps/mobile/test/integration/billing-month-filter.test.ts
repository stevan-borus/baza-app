import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { GET } from "@/app/api/billing/+api";
import { prisma } from "@/lib/server/prisma";

async function seedAcrossMonths() {
  const admin = await prisma.user.create({
    data: { email: "admin@test.local", firstName: "Admin", lastName: "User", role: "ADMIN" },
  });
  const client = await prisma.user.create({
    data: { email: "client@test.local", firstName: "Client", lastName: "User", role: "CLIENT" },
  });
  await prisma.billingRecord.create({
    data: {
      clientUserId: client.id,
      amount: 1000,
      method: "CASH",
      status: "CONFIRMED",
      createdAt: new Date("2026-04-15T10:00:00Z"),
    },
  });
  await prisma.billingRecord.create({
    data: {
      clientUserId: client.id,
      amount: 2000,
      method: "CASH",
      status: "CONFIRMED",
      createdAt: new Date("2026-05-15T10:00:00Z"),
    },
  });
  await prisma.billingRecord.create({
    data: {
      clientUserId: client.id,
      amount: 3000,
      method: "CASH",
      status: "CONFIRMED",
      createdAt: new Date("2026-06-15T10:00:00Z"),
    },
  });
  return { admin };
}

function asAdmin(admin: { id: string; email: string }) {
  setMockUser({
    id: admin.id,
    role: "ADMIN",
    email: admin.email,
    isActive: true,
    clientProfile: null,
  });
}

describe("GET /api/billing month filter", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("returns only April records when from/to span April", async () => {
    const { admin } = await seedAcrossMonths();
    asAdmin(admin);
    const from = "2026-04-01T00:00:00.000Z";
    const to = "2026-04-30T23:59:59.999Z";
    const response = await GET(
      new Request(`http://test.local/api/billing?from=${from}&to=${to}`),
    );
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.records).toHaveLength(1);
    expect(body.records[0].amount).toBe(1000);
  });

  it("returns only May records when from/to span May", async () => {
    const { admin } = await seedAcrossMonths();
    asAdmin(admin);
    const from = "2026-05-01T00:00:00.000Z";
    const to = "2026-05-31T23:59:59.999Z";
    const response = await GET(
      new Request(`http://test.local/api/billing?from=${from}&to=${to}`),
    );
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.records).toHaveLength(1);
    expect(body.records[0].amount).toBe(2000);
  });

  it("returns only June records when from/to span June", async () => {
    const { admin } = await seedAcrossMonths();
    asAdmin(admin);
    const from = "2026-06-01T00:00:00.000Z";
    const to = "2026-06-30T23:59:59.999Z";
    const response = await GET(
      new Request(`http://test.local/api/billing?from=${from}&to=${to}`),
    );
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.records).toHaveLength(1);
    expect(body.records[0].amount).toBe(3000);
  });
});
