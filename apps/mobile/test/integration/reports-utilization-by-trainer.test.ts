import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { GET } from "@/server/routes/reports/utilization/by-trainer";
import { prisma } from "@/lib/server/prisma";

async function seedSessionsAcrossTrainers() {
  const admin = await prisma.user.create({
    data: { email: "admin@test.local", firstName: "Admin", lastName: "Test", role: "ADMIN" },
  });
  const ana = await prisma.user.create({
    data: { email: "ana@test.local", firstName: "Ana", lastName: "Trainer", role: "TRAINER" },
  });
  const bo = await prisma.user.create({
    data: { email: "bo@test.local", firstName: "Bo", lastName: "Trainer", role: "TRAINER" },
  });
  const reformer = await prisma.classType.create({
    data: { name: "Reformer", maxClients: 6, durationMins: 60 },
  });
  const sala = await prisma.studioRoom.create({
    data: { name: "Sala 1", capacity: 12 },
  });

  await prisma.session.createMany({
    data: [
      {
        classTypeId: reformer.id,
        roomId: sala.id,
        trainerUserId: ana.id,
        startsAt: new Date("2026-04-05T10:00:00Z"),
        endsAt: new Date("2026-04-05T11:00:00Z"),
        capacity: 6,
        status: "SCHEDULED",
      },
      {
        classTypeId: reformer.id,
        roomId: sala.id,
        trainerUserId: bo.id,
        startsAt: new Date("2026-04-08T18:00:00Z"),
        endsAt: new Date("2026-04-08T19:00:00Z"),
        capacity: 6,
        status: "SCHEDULED",
      },
    ],
  });

  const sessions = await prisma.session.findMany({
    orderBy: { startsAt: "asc" },
    select: { id: true, trainerUserId: true },
  });
  const pkgType = await prisma.packageType.create({
    data: {
      name: "Pack",
      sessionCount: 12,
      validityDays: 30,
      lateCancelHours: 8,
      classTypes: { create: { classTypeId: reformer.id } },
    },
  });
  for (let i = 0; i < 4; i++) {
    const c = await prisma.user.create({
      data: { email: `a-${i}@test.local`, firstName: "A", lastName: String(i), role: "CLIENT" },
    });
    const cProfile = await prisma.clientProfile.create({ data: { userId: c.id } });
    const cPkg = await prisma.clientPackage.create({
      data: {
        clientProfileId: cProfile.id,
        packageTypeId: pkgType.id,
        classTypes: { create: { classTypeId: reformer.id } },
        lateCancelHours: 8,
        startsAt: new Date("2026-04-01T00:00:00Z"),
        expiresAt: new Date("2026-05-01T00:00:00Z"),
        sessionsRemaining: 12,
      },
    });
    await prisma.booking.create({
      data: { clientProfileId: cProfile.id, sessionId: sessions[0].id, clientPackageId: cPkg.id },
    });
  }
  for (let i = 0; i < 2; i++) {
    const c = await prisma.user.create({
      data: { email: `b-${i}@test.local`, firstName: "B", lastName: String(i), role: "CLIENT" },
    });
    const cProfile = await prisma.clientProfile.create({ data: { userId: c.id } });
    const cPkg = await prisma.clientPackage.create({
      data: {
        clientProfileId: cProfile.id,
        packageTypeId: pkgType.id,
        classTypes: { create: { classTypeId: reformer.id } },
        lateCancelHours: 8,
        startsAt: new Date("2026-04-01T00:00:00Z"),
        expiresAt: new Date("2026-05-01T00:00:00Z"),
        sessionsRemaining: 12,
      },
    });
    await prisma.booking.create({
      data: { clientProfileId: cProfile.id, sessionId: sessions[1].id, clientPackageId: cPkg.id },
    });
  }
  return { admin, ana, bo };
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

describe("GET /api/reports/utilization/by-trainer", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("returns utilization split by trainer", async () => {
    const { admin, ana, bo } = await seedSessionsAcrossTrainers();
    asAdmin(admin);
    const response = await GET(
      new Request(`http://test.local/api/reports/utilization/by-trainer?${TIMEFRAME}`),
    );
    const body = await response.json();
    expect(body.success).toBe(true);
    const anaRow = body.data.find((r: { trainerUserId: string }) => r.trainerUserId === ana.id);
    const boRow = body.data.find((r: { trainerUserId: string }) => r.trainerUserId === bo.id);
    expect(anaRow.totalBooked).toBe(4);
    expect(anaRow.totalCapacity).toBe(6);
    expect(anaRow.utilization).toBeCloseTo(0.6667, 2);
    expect(anaRow.trainerName).toBe("Ana Trainer");
    expect(boRow.totalBooked).toBe(2);
    expect(boRow.totalCapacity).toBe(6);
    expect(boRow.utilization).toBeCloseTo(0.3333, 2);
    expect(boRow.trainerName).toBe("Bo Trainer");
  });

  it("returns rows sorted by utilization descending", async () => {
    const { admin } = await seedSessionsAcrossTrainers();
    asAdmin(admin);
    const response = await GET(
      new Request(`http://test.local/api/reports/utilization/by-trainer?${TIMEFRAME}`),
    );
    const body = await response.json();
    for (let i = 0; i < body.data.length - 1; i++) {
      expect(body.data[i].utilization).toBeGreaterThanOrEqual(body.data[i + 1].utilization);
    }
  });
});
