import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { GET } from "@/server/routes/reports/packages";
import { prisma } from "@/lib/server/prisma";

async function seedPackagesAndAssignments() {
  const admin = await prisma.user.create({
    data: { email: "admin@test.local", firstName: "Admin", lastName: "Test", role: "ADMIN" },
  });
  const reformer = await prisma.classType.create({
    data: { name: "Reformer", maxClients: 6, durationMins: 60 },
  });
  const energy = await prisma.classType.create({
    data: { name: "Energy", maxClients: 12, durationMins: 45 },
  });
  const reformer12 = await prisma.packageType.create({
    data: {
      name: "Reformer 12",
      sessionCount: 12,
      validityDays: 30,
      lateCancelHours: 12,
      classTypes: { create: { classTypeId: reformer.id } },
    },
  });
  const reformer8 = await prisma.packageType.create({
    data: {
      name: "Reformer 8",
      sessionCount: 8,
      validityDays: 30,
      lateCancelHours: 12,
      classTypes: { create: { classTypeId: reformer.id } },
    },
  });
  const energy12 = await prisma.packageType.create({
    data: {
      name: "Energy 12",
      sessionCount: 12,
      validityDays: 30,
      lateCancelHours: 12,
      classTypes: { create: { classTypeId: energy.id } },
    },
  });

  // Seed 3 clients, each with one ClientPackage of varying types.
  // Use the seed window so the reports filter (from/to) catches them.
  const seedAt = new Date("2026-04-15T10:00:00Z");
  const expiresAt = new Date("2026-06-15T10:00:00Z");
  const clients = [];
  for (let i = 0; i < 3; i++) {
    const client = await prisma.user.create({
      data: { email: `c${i}@test.local`, firstName: `C${i}`, lastName: "Test", role: "CLIENT" },
    });
    const profile = await prisma.clientProfile.create({
      data: { userId: client.id },
    });
    clients.push({ client, profile });
  }

  // 2x reformer12 (one paid via BillingRecord, one comp), 1x reformer8 paid, 1x energy12 paid.
  // Most-used PackageType: Reformer 12 (count 2).
  await prisma.clientPackage.create({
    data: {
      clientProfileId: clients[0].profile.id,
      packageTypeId: reformer12.id,
      classTypes: { create: { classTypeId: reformer.id } },
      lateCancelHours: 12,
      startsAt: seedAt,
      expiresAt,
      sessionsRemaining: 12,
    },
  });
  await prisma.billingRecord.create({
    data: {
      clientUserId: clients[0].client.id,
      amount: 12000,
      method: "CASH",
      status: "CONFIRMED",
      packageTypeId: reformer12.id,
      createdAt: seedAt,
    },
  });

  // Comp (no BillingRecord) — counts as a comp ClientPackage in the ratio.
  await prisma.clientPackage.create({
    data: {
      clientProfileId: clients[1].profile.id,
      packageTypeId: reformer12.id,
      classTypes: { create: { classTypeId: reformer.id } },
      lateCancelHours: 12,
      startsAt: seedAt,
      expiresAt,
      sessionsRemaining: 12,
    },
  });

  await prisma.clientPackage.create({
    data: {
      clientProfileId: clients[2].profile.id,
      packageTypeId: reformer8.id,
      classTypes: { create: { classTypeId: reformer.id } },
      lateCancelHours: 12,
      startsAt: seedAt,
      expiresAt,
      sessionsRemaining: 8,
    },
  });
  await prisma.billingRecord.create({
    data: {
      clientUserId: clients[2].client.id,
      amount: 8000,
      method: "CASH",
      status: "CONFIRMED",
      packageTypeId: reformer8.id,
      createdAt: seedAt,
    },
  });

  // Energy 12 — paid.
  const energyClient = await prisma.user.create({
    data: { email: "energy@test.local", firstName: "Energy", lastName: "C", role: "CLIENT" },
  });
  const energyProfile = await prisma.clientProfile.create({
    data: { userId: energyClient.id },
  });
  await prisma.clientPackage.create({
    data: {
      clientProfileId: energyProfile.id,
      packageTypeId: energy12.id,
      classTypes: { create: { classTypeId: energy.id } },
      lateCancelHours: 12,
      startsAt: seedAt,
      expiresAt,
      sessionsRemaining: 12,
    },
  });
  await prisma.billingRecord.create({
    data: {
      clientUserId: energyClient.id,
      amount: 13000,
      method: "CARD",
      status: "CONFIRMED",
      packageTypeId: energy12.id,
      createdAt: seedAt,
    },
  });

  return { admin, reformer12, reformer8, energy12 };
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

const TIMEFRAME = "from=2026-04-01T00:00:00Z&to=2026-05-01T00:00:00Z&period=month";

describe("GET /api/reports/packages", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("returns most-used packages by count of ClientPackages within the timeframe", async () => {
    const { admin, reformer12 } = await seedPackagesAndAssignments();
    asAdmin(admin);
    const response = await GET(
      new Request(`http://test.local/api/reports/packages?${TIMEFRAME}`),
    );
    const body = await response.json();
    expect(body.success).toBe(true);
    const top = body.mostUsed[0];
    expect(top.packageTypeId).toBe(reformer12.id);
    expect(top.count).toBe(2);
  });

  it("returns revenue per PackageType from BillingRecords", async () => {
    const { admin, reformer12, energy12 } = await seedPackagesAndAssignments();
    asAdmin(admin);
    const response = await GET(
      new Request(`http://test.local/api/reports/packages?${TIMEFRAME}`),
    );
    const body = await response.json();
    const reformer12Revenue = body.revenuePerType.find(
      (r: { packageTypeId: string }) => r.packageTypeId === reformer12.id,
    );
    const energy12Revenue = body.revenuePerType.find(
      (r: { packageTypeId: string }) => r.packageTypeId === energy12.id,
    );
    expect(reformer12Revenue?.revenue).toBe(12000); // only one of the two reformer12 was paid
    expect(energy12Revenue?.revenue).toBe(13000);
  });

  it("returns comp vs paid ratio across ClientPackages in the timeframe", async () => {
    const { admin } = await seedPackagesAndAssignments();
    asAdmin(admin);
    const response = await GET(
      new Request(`http://test.local/api/reports/packages?${TIMEFRAME}`),
    );
    const body = await response.json();
    // 4 ClientPackages: 3 paid (have a BillingRecord with packageTypeId) + 1 comp (no BillingRecord).
    expect(body.compVsPaid.paid).toBe(3);
    expect(body.compVsPaid.comp).toBe(1);
  });

  it("rejects non-admin callers", async () => {
    const { admin } = await seedPackagesAndAssignments();
    setMockUser({
      id: admin.id,
      role: "TRAINER",
      email: admin.email,
      isActive: true,
      clientProfile: null,
    });
    const response = await GET(
      new Request(`http://test.local/api/reports/packages?${TIMEFRAME}`),
    );
    expect(response.status).toBe(403);
  });
});
