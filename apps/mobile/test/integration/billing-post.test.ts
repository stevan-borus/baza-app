import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { POST } from "@/server/routes/billing";
import { prisma } from "@/lib/server/prisma";

async function seedClientAndPackageType() {
  const adminUser = await prisma.user.create({
    data: { email: "admin@test.local", firstName: "Admin", lastName: "User", role: "ADMIN" },
  });
  const clientUser = await prisma.user.create({
    data: { email: "client@test.local", firstName: "Client", lastName: "User", role: "CLIENT" },
  });
  const clientProfile = await prisma.clientProfile.create({
    data: { userId: clientUser.id },
  });
  const classType = await prisma.classType.create({
    data: { name: "Reformer pilates", maxClients: 6, durationMins: 60 },
  });
  const packageType = await prisma.packageType.create({
    data: {
      name: "Reformer 12",
      sessionCount: 12,
      validityDays: 30,
      lateCancelHours: 24,
      classTypeId: classType.id,
    },
  });
  return { adminUser, clientUser, clientProfile, classType, packageType };
}

function buildJsonRequest(body: unknown) {
  return new Request("http://test.local/api/billing", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/billing", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("creates BillingRecord + ClientPackage atomically with snapshotted classTypeId and lateCancelHours", async () => {
    const { adminUser, clientUser, classType, packageType } =
      await seedClientAndPackageType();
    setMockUser({
      id: adminUser.id,
      role: "ADMIN",
      email: adminUser.email,
      isActive: true,
      clientProfile: null,
    });

    const res = await POST(
      buildJsonRequest({
        clientUserId: clientUser.id,
        amount: 15000,
        method: "CASH",
        status: "CONFIRMED",
        packageTypeId: packageType.id,
        activatePackageOnConfirm: true,
      }),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.payment.status).toBe("CONFIRMED");
    expect(json.clientPackage.classTypeId).toBe(classType.id);

    const records = await prisma.billingRecord.findMany();
    expect(records).toHaveLength(1);
    const packs = await prisma.clientPackage.findMany();
    expect(packs).toHaveLength(1);
    expect(packs[0].classTypeId).toBe(classType.id);
    expect(packs[0].lateCancelHours).toBe(24);
    expect(packs[0].sessionsRemaining).toBe(12);
  });

  it("defaults status to CONFIRMED when omitted", async () => {
    const { adminUser, clientUser, packageType } = await seedClientAndPackageType();
    setMockUser({
      id: adminUser.id,
      role: "ADMIN",
      email: adminUser.email,
      isActive: true,
      clientProfile: null,
    });

    const res = await POST(
      buildJsonRequest({
        clientUserId: clientUser.id,
        amount: 11000,
        method: "CASH",
        packageTypeId: packageType.id,
        activatePackageOnConfirm: true,
      }),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.payment.status).toBe("CONFIRMED");
    expect(json.clientPackage).not.toBeNull();
  });

  it("rolls back the BillingRecord when ClientPackage prerequisites are missing", async () => {
    const { adminUser, clientUser } = await seedClientAndPackageType();
    setMockUser({
      id: adminUser.id,
      role: "ADMIN",
      email: adminUser.email,
      isActive: true,
      clientProfile: null,
    });

    const res = await POST(
      buildJsonRequest({
        clientUserId: clientUser.id,
        amount: 9999,
        method: "CASH",
        status: "CONFIRMED",
        packageTypeId: "00000000-0000-0000-0000-000000000000",
        activatePackageOnConfirm: true,
      }),
    );
    expect(res.status).toBe(404);
    const records = await prisma.billingRecord.findMany();
    expect(records).toHaveLength(0);
    const packs = await prisma.clientPackage.findMany();
    expect(packs).toHaveLength(0);
  });

  it("creates a BillingRecord without ClientPackage when no packageTypeId is given", async () => {
    const { adminUser, clientUser } = await seedClientAndPackageType();
    setMockUser({
      id: adminUser.id,
      role: "ADMIN",
      email: adminUser.email,
      isActive: true,
      clientProfile: null,
    });

    const res = await POST(
      buildJsonRequest({
        clientUserId: clientUser.id,
        amount: 5000,
        method: "CASH",
        status: "CONFIRMED",
      }),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.payment.status).toBe("CONFIRMED");
    expect(json.clientPackage).toBeNull();
    const packs = await prisma.clientPackage.findMany();
    expect(packs).toHaveLength(0);
  });
});
