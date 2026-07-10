import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { GET } from "@/server/routes/reports/utilization/by-class-type";
import { prisma } from "@/lib/server/prisma";

async function seedSessionsAcrossClassTypes() {
  const admin = await prisma.user.create({
    data: { email: "admin@test.local", firstName: "Admin", lastName: "Test", role: "ADMIN" },
  });
  const trainer = await prisma.user.create({
    data: { email: "t@test.local", firstName: "T", lastName: "Test", role: "TRAINER" },
  });
  const reformer = await prisma.classType.create({
    data: { name: "Reformer", maxClients: 6, durationMins: 60 },
  });
  const energy = await prisma.classType.create({
    data: { name: "Energy", maxClients: 12, durationMins: 60 },
  });
  const sala = await prisma.studioRoom.create({
    data: { name: "Sala 1", capacity: 12 },
  });

  await prisma.session.createMany({
    data: [
      {
        classTypeId: reformer.id,
        roomId: sala.id,
        trainerUserId: trainer.id,
        startsAt: new Date("2026-04-05T10:00:00Z"),
        endsAt: new Date("2026-04-05T11:00:00Z"),
        capacity: 6,
        status: "SCHEDULED",
      },
      {
        classTypeId: energy.id,
        roomId: sala.id,
        trainerUserId: trainer.id,
        startsAt: new Date("2026-04-08T18:00:00Z"),
        endsAt: new Date("2026-04-08T19:00:00Z"),
        capacity: 12,
        status: "SCHEDULED",
      },
    ],
  });

  const sessions = await prisma.session.findMany({
    orderBy: { startsAt: "asc" },
    select: { id: true, classTypeId: true },
  });
  const pkgType = await prisma.packageType.create({
    data: {
      name: "Pack",
      sessionCount: 12,
      validityDays: 30,
      lateCancelHours: 8,
      classTypeId: reformer.id,
    },
  });
  // 3 bookings on the reformer session.
  for (let i = 0; i < 3; i++) {
    const c = await prisma.user.create({
      data: { email: `r-${i}@test.local`, firstName: "R", lastName: String(i), role: "CLIENT" },
    });
    const cProfile = await prisma.clientProfile.create({ data: { userId: c.id } });
    const cPkg = await prisma.clientPackage.create({
      data: {
        clientProfileId: cProfile.id,
        packageTypeId: pkgType.id,
        classTypeId: reformer.id,
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
  // 6 bookings on the energy session.
  for (let i = 0; i < 6; i++) {
    const c = await prisma.user.create({
      data: { email: `e-${i}@test.local`, firstName: "E", lastName: String(i), role: "CLIENT" },
    });
    const cProfile = await prisma.clientProfile.create({ data: { userId: c.id } });
    const cPkg = await prisma.clientPackage.create({
      data: {
        clientProfileId: cProfile.id,
        packageTypeId: pkgType.id,
        classTypeId: reformer.id,
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
  return { admin, reformer, energy };
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

describe("GET /api/reports/utilization/by-class-type", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("returns utilization split by class type", async () => {
    const { admin, reformer, energy } = await seedSessionsAcrossClassTypes();
    asAdmin(admin);
    const response = await GET(
      new Request(`http://test.local/api/reports/utilization/by-class-type?${TIMEFRAME}`),
    );
    const body = await response.json();
    expect(body.success).toBe(true);
    const reformerRow = body.data.find((r: { classTypeId: string }) => r.classTypeId === reformer.id);
    const energyRow = body.data.find((r: { classTypeId: string }) => r.classTypeId === energy.id);
    expect(reformerRow.totalBooked).toBe(3);
    expect(reformerRow.totalCapacity).toBe(6);
    expect(reformerRow.utilization).toBeCloseTo(0.5, 2);
    expect(reformerRow.name).toBe("Reformer");
    expect(energyRow.totalBooked).toBe(6);
    expect(energyRow.totalCapacity).toBe(12);
    expect(energyRow.utilization).toBeCloseTo(0.5, 2);
    expect(energyRow.name).toBe("Energy");
  });

  it("rejects non-admin / non-trainer callers", async () => {
    const { admin } = await seedSessionsAcrossClassTypes();
    setMockUser({
      id: admin.id,
      role: "CLIENT",
      email: admin.email,
      isActive: true,
      clientProfile: null,
    });
    const response = await GET(
      new Request(`http://test.local/api/reports/utilization/by-class-type?${TIMEFRAME}`),
    );
    expect(response.status).toBe(403);
  });
});
