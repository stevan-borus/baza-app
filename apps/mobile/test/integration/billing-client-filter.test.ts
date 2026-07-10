import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { GET } from "@/server/routes/billing";
import { prisma } from "@/lib/server/prisma";

async function seedTwoClientsWithPayments() {
  const admin = await prisma.user.create({
    data: { email: "admin@test.local", firstName: "Admin", lastName: "User", role: "ADMIN" },
  });
  const clientA = await prisma.user.create({
    data: { email: "a@test.local", firstName: "Client", lastName: "A", role: "CLIENT" },
  });
  const clientB = await prisma.user.create({
    data: { email: "b@test.local", firstName: "Client", lastName: "B", role: "CLIENT" },
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
