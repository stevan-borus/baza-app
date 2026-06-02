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

import { GET } from "@/app/api/reports/utilization/by-room/+api";
import { prisma } from "@/lib/server/prisma";

async function seedSessionsAcrossRooms() {
  const admin = await prisma.user.create({
    data: { email: "admin@test.local", firstName: "Admin", lastName: "Test", role: "ADMIN" },
  });
  const trainer = await prisma.user.create({
    data: { email: "t@test.local", firstName: "T", lastName: "Test", role: "TRAINER" },
  });
  const reformer = await prisma.classType.create({
    data: { name: "Reformer", maxClients: 6, durationMins: 60 },
  });
  const sala1 = await prisma.studioRoom.create({
    data: { name: "Sala 1", capacity: 6 },
  });
  const sala2 = await prisma.studioRoom.create({
    data: { name: "Sala 2", capacity: 12 },
  });

  // Two sessions in Sala 1 within April 2026, one in Sala 2.
  await prisma.session.createMany({
    data: [
      {
        classTypeId: reformer.id,
        roomId: sala1.id,
        trainerUserId: trainer.id,
        startsAt: new Date("2026-04-05T10:00:00Z"),
        endsAt: new Date("2026-04-05T11:00:00Z"),
        capacity: 6,
        status: "SCHEDULED",
      },
      {
        classTypeId: reformer.id,
        roomId: sala1.id,
        trainerUserId: trainer.id,
        startsAt: new Date("2026-04-12T10:00:00Z"),
        endsAt: new Date("2026-04-12T11:00:00Z"),
        capacity: 6,
        status: "SCHEDULED",
      },
      {
        classTypeId: reformer.id,
        roomId: sala2.id,
        trainerUserId: trainer.id,
        startsAt: new Date("2026-04-08T18:00:00Z"),
        endsAt: new Date("2026-04-08T19:00:00Z"),
        capacity: 12,
        status: "SCHEDULED",
      },
    ],
  });

  // Add bookings: 3 in the first Sala 1 session, 6 in the Sala 2 session.
  // Total Sala 1: 3 booked / 12 capacity = 25%. Sala 2: 6/12 = 50%.
  const ana = await prisma.user.create({
    data: { email: "ana@test.local", firstName: "Ana", lastName: "Test", role: "CLIENT" },
  });
  const anaProfile = await prisma.clientProfile.create({ data: { userId: ana.id } });
  const pkgType = await prisma.packageType.create({
    data: {
      name: "Reformer 12",
      sessionCount: 12,
      validityDays: 30,
      lateCancelHours: 12,
      classTypeId: reformer.id,
    },
  });
  const anaPkg = await prisma.clientPackage.create({
    data: {
      clientProfileId: anaProfile.id,
      packageTypeId: pkgType.id,
      classTypeId: reformer.id,
      lateCancelHours: 12,
      startsAt: new Date("2026-04-01T00:00:00Z"),
      expiresAt: new Date("2026-05-01T00:00:00Z"),
      sessionsRemaining: 12,
    },
  });
  const sessions = await prisma.session.findMany({
    orderBy: { startsAt: "asc" },
    select: { id: true, roomId: true },
  });
  // 3 bookings on first session (Sala 1).
  for (let i = 0; i < 3; i++) {
    const c = await prisma.user.create({
      data: { email: `s1-${i}@test.local`, firstName: "S1", lastName: String(i), role: "CLIENT" },
    });
    const cProfile = await prisma.clientProfile.create({ data: { userId: c.id } });
    await prisma.clientPackage.create({
      data: {
        clientProfileId: cProfile.id,
        packageTypeId: pkgType.id,
        classTypeId: reformer.id,
        lateCancelHours: 12,
        startsAt: new Date("2026-04-01T00:00:00Z"),
        expiresAt: new Date("2026-05-01T00:00:00Z"),
        sessionsRemaining: 12,
      },
    });
    const cPkg = await prisma.clientPackage.findFirstOrThrow({
      where: { clientProfileId: cProfile.id },
      select: { id: true },
    });
    await prisma.booking.create({
      data: {
        clientProfileId: cProfile.id,
        sessionId: sessions[0].id,
        clientPackageId: cPkg.id,
      },
    });
  }
  // 6 bookings on the Sala 2 session.
  for (let i = 0; i < 6; i++) {
    const c = await prisma.user.create({
      data: { email: `s2-${i}@test.local`, firstName: "S2", lastName: String(i), role: "CLIENT" },
    });
    const cProfile = await prisma.clientProfile.create({ data: { userId: c.id } });
    await prisma.clientPackage.create({
      data: {
        clientProfileId: cProfile.id,
        packageTypeId: pkgType.id,
        classTypeId: reformer.id,
        lateCancelHours: 12,
        startsAt: new Date("2026-04-01T00:00:00Z"),
        expiresAt: new Date("2026-05-01T00:00:00Z"),
        sessionsRemaining: 12,
      },
    });
    const cPkg = await prisma.clientPackage.findFirstOrThrow({
      where: { clientProfileId: cProfile.id },
      select: { id: true },
    });
    await prisma.booking.create({
      data: {
        clientProfileId: cProfile.id,
        sessionId: sessions[1].id,
        clientPackageId: cPkg.id,
      },
    });
  }

  // Avoid unused warnings.
  void anaPkg;

  return { admin, sala1, sala2 };
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

describe("GET /api/reports/utilization/by-room", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("returns utilization split by room", async () => {
    const { admin, sala1, sala2 } = await seedSessionsAcrossRooms();
    asAdmin(admin);
    const response = await GET(
      new Request(`http://test.local/api/reports/utilization/by-room?${TIMEFRAME}`),
    );
    const body = await response.json();
    expect(body.success).toBe(true);
    const sala1Row = body.data.find((r: { roomId: string }) => r.roomId === sala1.id);
    const sala2Row = body.data.find((r: { roomId: string }) => r.roomId === sala2.id);
    expect(sala1Row).toBeDefined();
    expect(sala2Row).toBeDefined();
    // Sala 1: 3 booked / 12 capacity = 0.25
    expect(sala1Row.totalBooked).toBe(3);
    expect(sala1Row.totalCapacity).toBe(12);
    expect(sala1Row.utilization).toBeCloseTo(0.25, 2);
    expect(sala1Row.roomName).toBe("Sala 1");
    // Sala 2: 6 booked / 12 capacity = 0.5
    expect(sala2Row.totalBooked).toBe(6);
    expect(sala2Row.totalCapacity).toBe(12);
    expect(sala2Row.utilization).toBeCloseTo(0.5, 2);
    expect(sala2Row.roomName).toBe("Sala 2");
  });

  it("returns rooms sorted by utilization descending", async () => {
    const { admin } = await seedSessionsAcrossRooms();
    asAdmin(admin);
    const response = await GET(
      new Request(`http://test.local/api/reports/utilization/by-room?${TIMEFRAME}`),
    );
    const body = await response.json();
    expect(body.data[0].utilization).toBeGreaterThanOrEqual(body.data[1].utilization);
  });

  it("rejects non-admin / non-trainer callers", async () => {
    const { admin } = await seedSessionsAcrossRooms();
    setMockUser({
      id: admin.id,
      role: "CLIENT",
      email: admin.email,
      isActive: true,
      clientProfile: null,
    });
    const response = await GET(
      new Request(`http://test.local/api/reports/utilization/by-room?${TIMEFRAME}`),
    );
    expect(response.status).toBe(403);
  });
});
