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

import { GET } from "@/app/api/billing/+api";
import { prisma } from "@/lib/server/prisma";

async function seedTwoClientsWithPayments() {
  const admin = await prisma.user.create({
    data: { email: "admin@test.local", fullName: "Admin", role: "ADMIN" },
  });
  const clientA = await prisma.user.create({
    data: { email: "a@test.local", fullName: "Client A", role: "CLIENT" },
  });
  const clientB = await prisma.user.create({
    data: { email: "b@test.local", fullName: "Client B", role: "CLIENT" },
  });
  await prisma.billingRecord.create({
    data: { clientUserId: clientA.id, amount: 100, method: "CASH", status: "CONFIRMED" },
  });
  await prisma.billingRecord.create({
    data: { clientUserId: clientA.id, amount: 200, method: "CARD", status: "CONFIRMED" },
  });
  await prisma.billingRecord.create({
    data: { clientUserId: clientB.id, amount: 300, method: "CASH", status: "CONFIRMED" },
  });
  return { admin, clientA, clientB };
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

describe("GET /api/billing client filter", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("returns all records when clientUserId is omitted", async () => {
    const { admin } = await seedTwoClientsWithPayments();
    asAdmin(admin);
    const response = await GET(new Request("http://test.local/api/billing"));
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.records).toHaveLength(3);
  });

  it("filters to only the given client when clientUserId is provided", async () => {
    const { admin, clientA } = await seedTwoClientsWithPayments();
    asAdmin(admin);
    const response = await GET(
      new Request(`http://test.local/api/billing?clientUserId=${clientA.id}`),
    );
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.records).toHaveLength(2);
    expect(body.records.every((r: { clientUserId: string }) => r.clientUserId === clientA.id)).toBe(true);
  });

  it("returns empty array when clientUserId matches no records", async () => {
    const { admin } = await seedTwoClientsWithPayments();
    asAdmin(admin);
    const response = await GET(
      new Request("http://test.local/api/billing?clientUserId=nonexistent"),
    );
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.records).toHaveLength(0);
  });
});
