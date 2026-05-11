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
      if (!allowed.includes(user.role))
        return { ok: false as const, response: fail("Forbidden", 403) };
      return { ok: true as const, user };
    },
    getRequestUser: async () => mod.getMockUser(),
  };
});

import { GET } from "@/app/api/sessions/[id]/+api";
import { prisma } from "@/lib/server/prisma";
import { now } from "@/lib/now";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function asAdmin(adminId: string) {
  setMockUser({
    id: adminId,
    role: "ADMIN",
    email: "admin@test.local",
    isActive: true,
    clientProfile: null,
  });
}

async function ensureFixtures() {
  const admin = await prisma.user.create({
    data: { email: "admin@test.local", fullName: "Admin", role: "ADMIN" },
  });
  const classType = await prisma.classType.create({
    data: { name: "Reformer", maxClients: 6, durationMins: 60 },
  });
  const room = await prisma.studioRoom.create({
    data: { name: "Sala 1", capacity: 6 },
  });
  const trainer = await prisma.user.create({
    data: { email: "t@test.local", fullName: "Trainer T", role: "TRAINER" },
  });
  const pkgType = await prisma.packageType.create({
    data: {
      name: "Reformer 12",
      sessionCount: 12,
      validityDays: 30,
      lateCancelHours: 12,
      classTypeId: classType.id,
    },
  });
  return { admin, classType, room, trainer, pkgType };
}

async function createClient(
  email: string,
  fullName: string,
  pkgType: { id: string; classTypeId: string },
) {
  const user = await prisma.user.create({
    data: { email, fullName, role: "CLIENT" },
  });
  const profile = await prisma.clientProfile.create({ data: { userId: user.id } });
  const pkg = await prisma.clientPackage.create({
    data: {
      clientProfileId: profile.id,
      packageTypeId: pkgType.id,
      classTypeId: pkgType.classTypeId,
      lateCancelHours: 12,
      startsAt: now(),
      expiresAt: new Date(now().getTime() + 30 * DAY_MS),
      sessionsRemaining: 12,
    },
  });
  return { user, profile, pkg };
}

async function createSession(opts: {
  classTypeId: string;
  roomId: string;
  trainerUserId: string;
  recurringScheduleId?: string;
  offsetDays: number;
}) {
  const startsAt = new Date(now().getTime() + opts.offsetDays * DAY_MS);
  const endsAt = new Date(startsAt.getTime() + HOUR_MS);
  return prisma.session.create({
    data: {
      classTypeId: opts.classTypeId,
      roomId: opts.roomId,
      trainerUserId: opts.trainerUserId,
      startsAt,
      endsAt,
      capacity: 6,
      recurringScheduleId: opts.recurringScheduleId,
    },
  });
}

type SessionResponse = {
  success: boolean;
  session: {
    id: string;
    bookedCount: number;
    seriesBookedCount: number;
    bookings: { id: string }[];
    recurringScheduleId: string | null;
  };
};

async function getSession(id: string): Promise<SessionResponse> {
  const response = await GET(
    new Request(`http://test.local/api/sessions/${id}`),
    { id },
  );
  return (await response.json()) as SessionResponse;
}

describe("GET /api/sessions/[id] — seriesBookedCount", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("singleton session — seriesBookedCount equals bookedCount", async () => {
    const { admin, classType, room, trainer, pkgType } = await ensureFixtures();
    asAdmin(admin.id);

    const session = await createSession({
      classTypeId: classType.id,
      roomId: room.id,
      trainerUserId: trainer.id,
      offsetDays: 1,
    });

    // 3 bookings, no recurring linkage.
    for (let i = 0; i < 3; i++) {
      const { profile, pkg } = await createClient(
        `client-${i}@test.local`,
        `Client ${i}`,
        pkgType,
      );
      await prisma.booking.create({
        data: {
          clientProfileId: profile.id,
          sessionId: session.id,
          clientPackageId: pkg.id,
        },
      });
    }

    const body = await getSession(session.id);
    expect(body.success).toBe(true);
    expect(body.session.recurringScheduleId).toBeNull();
    expect(body.session.bookedCount).toBe(3);
    expect(body.session.seriesBookedCount).toBe(3);
  });

  it("recurring series — seriesBookedCount sums non-canceled bookings across the series", async () => {
    const { admin, classType, room, trainer, pkgType } = await ensureFixtures();
    asAdmin(admin.id);

    const schedule = await prisma.recurringSchedule.create({
      data: {
        classTypeId: classType.id,
        roomId: room.id,
        trainerUserId: trainer.id,
        weekdays: [1, 3],
        timeOfDayMins: 600,
        durationMins: 60,
        capacity: 6,
      },
    });

    // 4 sessions in the series — booking counts: 2, 0, 1, 3 (sum = 6).
    const seriesSessions = await Promise.all(
      [0, 1, 2, 3].map((offset) =>
        createSession({
          classTypeId: classType.id,
          roomId: room.id,
          trainerUserId: trainer.id,
          recurringScheduleId: schedule.id,
          offsetDays: 1 + offset,
        }),
      ),
    );

    const bookingCounts = [2, 0, 1, 3];
    let clientIndex = 0;
    for (let i = 0; i < seriesSessions.length; i++) {
      for (let j = 0; j < bookingCounts[i]; j++) {
        const { profile, pkg } = await createClient(
          `series-${clientIndex}@test.local`,
          `Series Client ${clientIndex}`,
          pkgType,
        );
        clientIndex++;
        await prisma.booking.create({
          data: {
            clientProfileId: profile.id,
            sessionId: seriesSessions[i].id,
            clientPackageId: pkg.id,
          },
        });
      }
    }

    // Session #2 (index 1) has 0 bookings of its own.
    const body = await getSession(seriesSessions[1].id);
    expect(body.success).toBe(true);
    expect(body.session.recurringScheduleId).toBe(schedule.id);
    expect(body.session.bookedCount).toBe(0);
    expect(body.session.seriesBookedCount).toBe(6);
  });

  it("canceled bookings are excluded from bookedCount and seriesBookedCount", async () => {
    const { admin, classType, room, trainer, pkgType } = await ensureFixtures();
    asAdmin(admin.id);

    const session = await createSession({
      classTypeId: classType.id,
      roomId: room.id,
      trainerUserId: trainer.id,
      offsetDays: 1,
    });

    // 2 active + 1 canceled.
    const { profile: p1, pkg: pkg1 } = await createClient(
      "c1@test.local",
      "C1",
      pkgType,
    );
    const { profile: p2, pkg: pkg2 } = await createClient(
      "c2@test.local",
      "C2",
      pkgType,
    );
    const { profile: p3, pkg: pkg3 } = await createClient(
      "c3@test.local",
      "C3",
      pkgType,
    );
    await prisma.booking.create({
      data: {
        clientProfileId: p1.id,
        sessionId: session.id,
        clientPackageId: pkg1.id,
      },
    });
    await prisma.booking.create({
      data: {
        clientProfileId: p2.id,
        sessionId: session.id,
        clientPackageId: pkg2.id,
      },
    });
    await prisma.booking.create({
      data: {
        clientProfileId: p3.id,
        sessionId: session.id,
        clientPackageId: pkg3.id,
        canceledAt: now(),
      },
    });

    const body = await getSession(session.id);
    expect(body.success).toBe(true);
    expect(body.session.bookedCount).toBe(2);
    // singleton: seriesBookedCount mirrors bookedCount, also excluding canceled.
    expect(body.session.seriesBookedCount).toBe(2);
  });
});
