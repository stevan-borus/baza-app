import { describe, it, expect, beforeEach, vi } from "vitest";
import { setMockUser } from "./auth-mock";

vi.mock("@/lib/server/auth-guards", async () => {
  const { fail } = await import("@/lib/server/http");
  const mod = await import("./auth-mock");
  return {
    requireRole: async (_req: Request, allowed: string[]) => {
      const user = mod.getMockUser();
      if (!user) return { ok: false as const, response: fail("Unauthorized", 401) };
      if (!allowed.includes(user.role))
        return { ok: false as const, response: fail("Forbidden", 403) };
      return { ok: true as const, user };
    },
    getRequestUser: async () => mod.getMockUser(),
  };
});

vi.mock("@/lib/server/notifications", () => ({
  createSystemNotification: vi.fn(async () => undefined),
}));

import { POST as bookingsPOST } from "@/app/api/bookings/+api";
import { POST as guardianVerifiedPOST } from "@/app/api/admin/clients/[id]/guardian-verified+api";
import { prisma } from "@/lib/server/prisma";
import { now, nowMs } from "@/lib/now";
import { resetDb } from "./setup-db";
import { ACTIVE_VERSIONS } from "@/lib/legal/versions";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

async function seedClassRoomTrainer() {
  const classType = await prisma.classType.create({
    data: { name: "Reformer pilates", maxClients: 6, durationMins: 60 },
  });
  const room = await prisma.studioRoom.create({
    data: { name: "Sala 1", capacity: 6 },
  });
  const trainer = await prisma.user.create({
    data: {
      email: "trainer-gate@t.local",
      fullName: "Trainer",
      role: "TRAINER",
      trainerProfile: { create: {} },
    },
  });
  return { classType, room, trainer };
}

async function seedClientPackage(
  clientProfileId: string,
  classTypeId: string,
) {
  const packageType = await prisma.packageType.create({
    data: {
      name: "Reformer 10",
      sessionCount: 10,
      validityDays: 365,
      lateCancelHours: 12,
      classTypeId,
    },
  });
  return prisma.clientPackage.create({
    data: {
      clientProfileId,
      packageTypeId: packageType.id,
      classTypeId,
      lateCancelHours: 12,
      sessionsRemaining: 10,
      startsAt: new Date(nowMs() - 90 * DAY_MS),
      expiresAt: new Date(nowMs() + 90 * DAY_MS),
    },
  });
}

async function seedCompletedSession({
  clientProfileId,
  classTypeId,
  roomId,
  trainerUserId,
  packageId,
}: {
  clientProfileId: string;
  classTypeId: string;
  roomId: string;
  trainerUserId: string;
  packageId: string;
}) {
  const startsAt = new Date(nowMs() - 30 * DAY_MS);
  const endsAt = new Date(startsAt.getTime() + HOUR_MS);
  const session = await prisma.session.create({
    data: {
      classTypeId,
      roomId,
      trainerUserId,
      startsAt,
      endsAt,
      capacity: 6,
      status: "COMPLETED",
    },
  });
  await prisma.booking.create({
    data: {
      sessionId: session.id,
      clientProfileId,
      clientPackageId: packageId,
    },
  });
  return session;
}

async function seedBookableSession({
  classTypeId,
  roomId,
  trainerUserId,
}: {
  classTypeId: string;
  roomId: string;
  trainerUserId: string;
}) {
  const startsAt = new Date(nowMs() + DAY_MS);
  const endsAt = new Date(startsAt.getTime() + HOUR_MS);
  return prisma.session.create({
    data: {
      classTypeId,
      roomId,
      trainerUserId,
      startsAt,
      endsAt,
      capacity: 6,
      status: "SCHEDULED",
    },
  });
}

function makeBookReq(sessionId: string) {
  return new Request("http://test.local/api/bookings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "BOOK", sessionId }),
  });
}

describe("POST /api/bookings — guardian verification gate", () => {
  let classTypeId: string;
  let roomId: string;
  let trainerUserId: string;

  beforeEach(async () => {
    await resetDb();
    const { classType, room, trainer } = await seedClassRoomTrainer();
    classTypeId = classType.id;
    roomId = room.id;
    trainerUserId = trainer.id;
  });

  async function seedMinor() {
    const minor = await prisma.user.create({
      data: {
        email: "minor-gate@t.local",
        fullName: "Minor Client",
        role: "CLIENT",
        clientProfile: {
          create: { dateOfBirth: new Date(now().getFullYear() - 12, 0, 1) },
        },
      },
      include: { clientProfile: true },
    });
    const profileId = minor.clientProfile!.id;
    const pkg = await seedClientPackage(profileId, classTypeId);
    setMockUser({
      id: minor.id,
      role: "CLIENT",
      email: minor.email,
      isActive: true,
      clientProfile: { id: profileId },
    });
    return { userId: minor.id, profileId, packageId: pkg.id };
  }

  async function seedAdult() {
    const adult = await prisma.user.create({
      data: {
        email: "adult-gate@t.local",
        fullName: "Adult Client",
        role: "CLIENT",
        clientProfile: { create: { dateOfBirth: new Date("1990-01-01") } },
      },
      include: { clientProfile: true },
    });
    const profileId = adult.clientProfile!.id;
    const pkg = await seedClientPackage(profileId, classTypeId);
    setMockUser({
      id: adult.id,
      role: "CLIENT",
      email: adult.email,
      isActive: true,
      clientProfile: { id: profileId },
    });
    return { userId: adult.id, profileId, packageId: pkg.id };
  }

  it("allows the first booking even for an unverified minor (no completed session yet)", async () => {
    await seedMinor();
    const session = await seedBookableSession({ classTypeId, roomId, trainerUserId });
    const res = await bookingsPOST(makeBookReq(session.id));
    expect(res.status).toBe(200);
  });

  it("blocks the second booking when the minor has a completed session and no guardian verification", async () => {
    const { profileId, packageId } = await seedMinor();
    await seedCompletedSession({
      clientProfileId: profileId,
      classTypeId,
      roomId,
      trainerUserId,
      packageId,
    });

    const next = await seedBookableSession({ classTypeId, roomId, trainerUserId });
    const res = await bookingsPOST(makeBookReq(next.id));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("GUARDIAN_VERIFICATION_REQUIRED");
  });

  it("admin-set guardianVerifiedAt unblocks subsequent bookings", async () => {
    const { userId, profileId, packageId } = await seedMinor();
    await seedCompletedSession({
      clientProfileId: profileId,
      classTypeId,
      roomId,
      trainerUserId,
      packageId,
    });

    // The guardian-verified endpoint requires an existing waiver_minor consent row.
    await prisma.consentRecord.create({
      data: {
        userId,
        documentKey: "waiver_minor",
        version: ACTIVE_VERSIONS.waiver_minor,
        locale: "sr",
        accepted: true,
        guardianName: "Test Guardian",
        guardianRelation: "parent",
      },
    });

    // Swap to an admin user and call the verify endpoint.
    const admin = await prisma.user.create({
      data: { email: "adm-gate@t.local", fullName: "Admin", role: "ADMIN" },
    });
    setMockUser({
      id: admin.id,
      role: "ADMIN",
      email: admin.email,
      isActive: true,
      clientProfile: null,
    });
    const verifyRes = await guardianVerifiedPOST(
      new Request(
        `http://test.local/api/admin/clients/${userId}/guardian-verified`,
        { method: "POST" },
      ),
      { params: { id: userId } },
    );
    expect(verifyRes.status).toBe(200);

    // Swap back to the minor.
    setMockUser({
      id: userId,
      role: "CLIENT",
      email: "minor-gate@t.local",
      isActive: true,
      clientProfile: { id: profileId },
    });

    const next = await seedBookableSession({ classTypeId, roomId, trainerUserId });
    const res = await bookingsPOST(makeBookReq(next.id));
    expect(res.status).toBe(200);
  });

  it("adult clients are unaffected even after completed sessions", async () => {
    const { profileId, packageId } = await seedAdult();
    await seedCompletedSession({
      clientProfileId: profileId,
      classTypeId,
      roomId,
      trainerUserId,
      packageId,
    });

    const next = await seedBookableSession({ classTypeId, roomId, trainerUserId });
    const res = await bookingsPOST(makeBookReq(next.id));
    expect(res.status).toBe(200);
  });
});
