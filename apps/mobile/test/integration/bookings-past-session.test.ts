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
import { prisma } from "@/lib/server/prisma";
import { nowMs } from "@/lib/now";
import { resetDb } from "./setup-db";

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
      email: "trainer-past@t.local",
      fullName: "Trainer",
      role: "TRAINER",
      trainerProfile: { create: {} },
    },
  });
  return { classType, room, trainer };
}

async function seedAdultWithPackage(classTypeId: string) {
  const adult = await prisma.user.create({
    data: {
      email: "adult-past@t.local",
      fullName: "Adult Client",
      role: "CLIENT",
      clientProfile: { create: { dateOfBirth: new Date("1990-01-01") } },
    },
    include: { clientProfile: true },
  });
  const profileId = adult.clientProfile!.id;
  const packageType = await prisma.packageType.create({
    data: {
      name: "Reformer 10",
      sessionCount: 10,
      validityDays: 365,
      lateCancelHours: 12,
      classTypeId,
    },
  });
  const pkg = await prisma.clientPackage.create({
    data: {
      clientProfileId: profileId,
      packageTypeId: packageType.id,
      classTypeId,
      lateCancelHours: 12,
      sessionsRemaining: 10,
      startsAt: new Date(nowMs() - 90 * DAY_MS),
      expiresAt: new Date(nowMs() + 90 * DAY_MS),
    },
  });
  setMockUser({
    id: adult.id,
    role: "CLIENT",
    email: adult.email,
    isActive: true,
    clientProfile: { id: profileId },
  });
  return { userId: adult.id, profileId, packageId: pkg.id };
}

async function seedSession(opts: {
  classTypeId: string;
  roomId: string;
  trainerUserId: string;
  startsAt: Date;
}) {
  return prisma.session.create({
    data: {
      classTypeId: opts.classTypeId,
      roomId: opts.roomId,
      trainerUserId: opts.trainerUserId,
      startsAt: opts.startsAt,
      endsAt: new Date(opts.startsAt.getTime() + HOUR_MS),
      capacity: 6,
      status: "SCHEDULED",
    },
  });
}

function makeReq(action: "BOOK" | "CANCEL", sessionId: string) {
  return new Request("http://test.local/api/bookings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, sessionId }),
  });
}

describe("POST /api/bookings — past-session guard", () => {
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

  it("rejects BOOK for a session that already started", async () => {
    await seedAdultWithPackage(classTypeId);
    const past = await seedSession({
      classTypeId,
      roomId,
      trainerUserId,
      startsAt: new Date(nowMs() - HOUR_MS),
    });
    const res = await bookingsPOST(makeReq("BOOK", past.id));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("SESSION_IN_PAST");
  });

  it("still allows BOOK for a future session", async () => {
    await seedAdultWithPackage(classTypeId);
    const future = await seedSession({
      classTypeId,
      roomId,
      trainerUserId,
      startsAt: new Date(nowMs() + DAY_MS),
    });
    const res = await bookingsPOST(makeReq("BOOK", future.id));
    expect(res.status).toBe(200);
  });

  // Cancelling a booking on a past session must still work — the guard only
  // applies to NEW bookings, not to undoing existing ones.
  it("still allows CANCEL on a past session", async () => {
    const { profileId, packageId } = await seedAdultWithPackage(classTypeId);
    const past = await seedSession({
      classTypeId,
      roomId,
      trainerUserId,
      startsAt: new Date(nowMs() - HOUR_MS),
    });
    await prisma.booking.create({
      data: {
        sessionId: past.id,
        clientProfileId: profileId,
        clientPackageId: packageId,
      },
    });
    const res = await bookingsPOST(makeReq("CANCEL", past.id));
    expect(res.status).toBe(200);
  });
});
