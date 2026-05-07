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

import { GET } from "@/app/api/sessions/[id]/+api";
import { prisma } from "@/lib/server/prisma";
import { now } from "@/lib/now";

async function seedAdminSessionWithBookings() {
  const admin = await prisma.user.create({
    data: { email: "admin@test.local", fullName: "Admin", role: "ADMIN" },
  });
  const reformer = await prisma.classType.create({
    data: { name: "Reformer", maxClients: 6, durationMins: 60 },
  });
  const room = await prisma.studioRoom.create({
    data: { name: "Sala 1", capacity: 6 },
  });
  const trainer = await prisma.user.create({
    data: { email: "t@test.local", fullName: "Trainer T", role: "TRAINER" },
  });
  const startsAt = new Date(now().getTime() + 24 * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
  const session = await prisma.session.create({
    data: {
      classTypeId: reformer.id,
      roomId: room.id,
      trainerUserId: trainer.id,
      startsAt,
      endsAt,
      capacity: 6,
    },
  });
  const pkgType = await prisma.packageType.create({
    data: {
      name: "Reformer 12",
      sessionCount: 12,
      validityDays: 30,
      lateCancelHours: 12,
      classTypeId: reformer.id,
    },
  });
  const ana = await prisma.user.create({
    data: { email: "ana@test.local", fullName: "Ana Anić", role: "CLIENT" },
  });
  const anaProfile = await prisma.clientProfile.create({ data: { userId: ana.id } });
  const anaPkg = await prisma.clientPackage.create({
    data: {
      clientProfileId: anaProfile.id,
      packageTypeId: pkgType.id,
      classTypeId: reformer.id,
      lateCancelHours: 12,
      startsAt: now(),
      expiresAt: new Date(now().getTime() + 30 * 24 * 60 * 60 * 1000),
      sessionsRemaining: 12,
    },
  });
  await prisma.booking.create({
    data: {
      clientProfileId: anaProfile.id,
      sessionId: session.id,
      clientPackageId: anaPkg.id,
    },
  });
  return { admin, session, ana };
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

describe("GET /api/sessions/[id]", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("returns session details + bookings with client name", async () => {
    const { admin, session, ana } = await seedAdminSessionWithBookings();
    asAdmin(admin);
    const response = await GET(
      new Request(`http://test.local/api/sessions/${session.id}`),
      { id: session.id },
    );
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.session.id).toBe(session.id);
    expect(body.session.bookings).toHaveLength(1);
    expect(body.session.bookings[0].client.fullName).toBe(ana.fullName);
  });

  it("404s for unknown session id", async () => {
    const { admin } = await seedAdminSessionWithBookings();
    asAdmin(admin);
    const response = await GET(
      new Request("http://test.local/api/sessions/nonexistent"),
      { id: "nonexistent" },
    );
    expect(response.status).toBe(404);
  });
});
