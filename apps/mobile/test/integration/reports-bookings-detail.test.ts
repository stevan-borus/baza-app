import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { GET as GET_DETAIL } from "@/app/api/reports/bookings/detail/+api";
import { prisma } from "@/lib/server/prisma";

const HOUR_MS = 60 * 60 * 1000;
// env.setup.ts pins TEST_ANCHOR_TIME to 2026-05-09T10:00:00Z. Match it.
const ANCHOR_ISO = "2026-05-09T10:00:00Z";
const ANCHOR = new Date(ANCHOR_ISO);

function asAdmin() {
  setMockUser({
    id: "admin-1",
    role: "ADMIN",
    email: "admin@test.local",
    isActive: true,
    clientProfile: null,
  });
}

function asTrainer() {
  setMockUser({
    id: "trainer-1",
    role: "TRAINER",
    email: "trainer@test.local",
    isActive: true,
    clientProfile: null,
  });
}

function req(path: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return new Request(`http://test.local${path}?${qs}`);
}

type DetailResponse = {
  success: boolean;
  headline: {
    totalBookings: number;
    showRate: number;
    canceledTotal: number;
    canceledPreCutoff: number;
    canceledLate: number;
    waitlistCount: number;
  };
  timeSeries: { bucketStart: string; bucketEnd: string; bookingCount: number }[];
  topSessions: {
    sessionId: string;
    startsAt: string;
    classTypeName: string;
    roomName: string | null;
    bookedCount: number;
    capacity: number;
  }[];
};

async function ensureFixtures() {
  const classType =
    (await prisma.classType.findFirst({ where: { name: "Reformer" } })) ??
    (await prisma.classType.create({
      data: { name: "Reformer", maxClients: 6, durationMins: 60 },
    }));
  const trainer =
    (await prisma.user.findFirst({ where: { email: "t@test.local" } })) ??
    (await prisma.user.create({
      data: { email: "t@test.local", firstName: "T", lastName: "Test", role: "TRAINER" },
    }));
  const room =
    (await prisma.studioRoom.findFirst({ where: { name: "Sala" } })) ??
    (await prisma.studioRoom.create({
      data: { name: "Sala", capacity: 10 },
    }));
  const packageType =
    (await prisma.packageType.findFirst()) ??
    (await prisma.packageType.create({
      data: {
        name: "Reformer 12",
        sessionCount: 12,
        validityDays: 365,
        lateCancelHours: 12,
        classTypeId: classType.id,
      },
    }));
  return { classType, trainer, room, packageType };
}

async function makeClientWithPackage(
  classTypeId: string,
  packageTypeId: string,
  lateCancelHours: number,
  tag: string,
) {
  const client = await prisma.user.create({
    data: {
      email: `client-${tag}@test.local`,
      firstName: "Client",
      lastName: tag,
      role: "CLIENT",
    },
  });
  const profile = await prisma.clientProfile.create({
    data: { userId: client.id },
  });
  const pkg = await prisma.clientPackage.create({
    data: {
      clientProfileId: profile.id,
      packageTypeId,
      classTypeId,
      lateCancelHours,
      startsAt: new Date("2026-01-01T00:00:00Z"),
      expiresAt: new Date("2030-01-01T00:00:00Z"),
      sessionsRemaining: 12,
    },
  });
  return { profile, pkg };
}

async function makeSession(opts: {
  classTypeId: string;
  trainerUserId: string;
  roomId: string;
  startsAt: Date;
  capacity?: number;
}) {
  return prisma.session.create({
    data: {
      classTypeId: opts.classTypeId,
      trainerUserId: opts.trainerUserId,
      roomId: opts.roomId,
      startsAt: opts.startsAt,
      endsAt: new Date(opts.startsAt.getTime() + HOUR_MS),
      capacity: opts.capacity ?? 10,
      status: "SCHEDULED",
    },
  });
}

async function makeBooking(opts: {
  sessionId: string;
  clientProfileId: string;
  clientPackageId: string;
  createdAt: Date;
  canceledAt?: Date | null;
}) {
  return prisma.booking.create({
    data: {
      sessionId: opts.sessionId,
      clientProfileId: opts.clientProfileId,
      clientPackageId: opts.clientPackageId,
      createdAt: opts.createdAt,
      canceledAt: opts.canceledAt ?? null,
    },
  });
}

describe("reports/bookings/detail", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("aggregates headline tiles correctly (total / canceled / show-rate)", async () => {
    // Window covers the whole seed → 10 bookings created in-window, 3
    // canceled (1 pre-cutoff, 2 late). 6 bookings have past sessions; 1 of
    // those 6 was canceled (the pre-cutoff one), so show-rate = 5/6.
    const { classType, trainer, room, packageType } = await ensureFixtures();

    // Past session (already happened before ANCHOR). 5 bookings — none
    // canceled — so all 5 count as "shown".
    const pastSession = await makeSession({
      classTypeId: classType.id,
      trainerUserId: trainer.id,
      roomId: room.id,
      startsAt: new Date(ANCHOR.getTime() - 3 * 24 * HOUR_MS),
      capacity: 10,
    });
    for (let i = 0; i < 5; i += 1) {
      const { profile, pkg } = await makeClientWithPackage(
        classType.id,
        packageType.id,
        12,
        `past-shown-${i}`,
      );
      await makeBooking({
        sessionId: pastSession.id,
        clientProfileId: profile.id,
        clientPackageId: pkg.id,
        createdAt: new Date(ANCHOR.getTime() - 5 * 24 * HOUR_MS),
      });
    }

    // Past session pre-cutoff cancel — startsAt 4d ago, canceledAt 2d
    // before startsAt → far outside any late window. Past + canceled = NOT
    // shown. lateCancelHours=12, so penaltyCutoff = startsAt - 12h.
    const preCutoffPastSession = await makeSession({
      classTypeId: classType.id,
      trainerUserId: trainer.id,
      roomId: room.id,
      startsAt: new Date(ANCHOR.getTime() - 4 * 24 * HOUR_MS),
      capacity: 10,
    });
    {
      const { profile, pkg } = await makeClientWithPackage(
        classType.id,
        packageType.id,
        12,
        "past-precancel",
      );
      await makeBooking({
        sessionId: preCutoffPastSession.id,
        clientProfileId: profile.id,
        clientPackageId: pkg.id,
        createdAt: new Date(ANCHOR.getTime() - 7 * 24 * HOUR_MS),
        canceledAt: new Date(ANCHOR.getTime() - 6 * 24 * HOUR_MS),
      });
    }

    // Two FUTURE late cancels — canceledAt within 12h of startsAt. Future
    // session so they don't enter the show-rate denominator at all.
    for (let i = 0; i < 2; i += 1) {
      const future = await makeSession({
        classTypeId: classType.id,
        trainerUserId: trainer.id,
        roomId: room.id,
        startsAt: new Date(ANCHOR.getTime() + 2 * 24 * HOUR_MS + i * HOUR_MS),
        capacity: 10,
      });
      const { profile, pkg } = await makeClientWithPackage(
        classType.id,
        packageType.id,
        12,
        `late-${i}`,
      );
      await makeBooking({
        sessionId: future.id,
        clientProfileId: profile.id,
        clientPackageId: pkg.id,
        createdAt: new Date(ANCHOR.getTime() - 1 * HOUR_MS),
        canceledAt: new Date(future.startsAt.getTime() - 1 * HOUR_MS), // late
      });
    }

    // Two FUTURE active bookings — not canceled, future startsAt. Don't
    // count toward show-rate either.
    for (let i = 0; i < 2; i += 1) {
      const future = await makeSession({
        classTypeId: classType.id,
        trainerUserId: trainer.id,
        roomId: room.id,
        startsAt: new Date(ANCHOR.getTime() + 5 * 24 * HOUR_MS + i * HOUR_MS),
        capacity: 10,
      });
      const { profile, pkg } = await makeClientWithPackage(
        classType.id,
        packageType.id,
        12,
        `future-active-${i}`,
      );
      await makeBooking({
        sessionId: future.id,
        clientProfileId: profile.id,
        clientPackageId: pkg.id,
        createdAt: new Date(ANCHOR.getTime() - 30 * 60 * 1000),
      });
    }

    asAdmin();
    const response = await GET_DETAIL(
      req("/api/reports/bookings/detail", {
        from: "2026-04-25T00:00:00Z",
        to: "2026-05-15T00:00:00Z",
        period: "month",
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as DetailResponse;
    expect(body.success).toBe(true);
    expect(body.headline.totalBookings).toBe(10);
    expect(body.headline.canceledTotal).toBe(3);
    expect(body.headline.canceledPreCutoff).toBe(1);
    expect(body.headline.canceledLate).toBe(2);
    // 6 past bookings (5 shown + 1 cancel). showRate = 5/6.
    expect(body.headline.showRate).toBeCloseTo(5 / 6, 4);
  });

  it("buckets the bookings time-series by `createdAt` per period", async () => {
    const { classType, trainer, room, packageType } = await ensureFixtures();
    const session = await makeSession({
      classTypeId: classType.id,
      trainerUserId: trainer.id,
      roomId: room.id,
      startsAt: new Date("2026-05-12T10:00:00Z"),
      capacity: 10,
    });
    // Day 0: 2 bookings. Day 2: 1 booking. Days 1,3,4,5,6: 0.
    for (let i = 0; i < 2; i += 1) {
      const { profile, pkg } = await makeClientWithPackage(
        classType.id,
        packageType.id,
        12,
        `bucket-d0-${i}`,
      );
      await makeBooking({
        sessionId: session.id,
        clientProfileId: profile.id,
        clientPackageId: pkg.id,
        createdAt: new Date("2026-05-01T08:00:00Z"),
      });
    }
    {
      const { profile, pkg } = await makeClientWithPackage(
        classType.id,
        packageType.id,
        12,
        "bucket-d2",
      );
      await makeBooking({
        sessionId: session.id,
        clientProfileId: profile.id,
        clientPackageId: pkg.id,
        createdAt: new Date("2026-05-03T09:00:00Z"),
      });
    }

    asAdmin();
    const response = await GET_DETAIL(
      req("/api/reports/bookings/detail", {
        from: "2026-05-01T00:00:00Z",
        to: "2026-05-08T00:00:00Z",
        period: "week",
      }),
    );
    const body = (await response.json()) as DetailResponse;
    expect(body.timeSeries).toHaveLength(7);
    expect(body.timeSeries[0].bookingCount).toBe(2);
    expect(body.timeSeries[1].bookingCount).toBe(0);
    expect(body.timeSeries[2].bookingCount).toBe(1);
    expect(body.timeSeries[3].bookingCount).toBe(0);
  });

  it("returns top sessions sorted by booking count desc", async () => {
    const { classType, trainer, room, packageType } = await ensureFixtures();
    const seedSessions: { id: string; bookings: number }[] = [];
    for (const [idx, count] of [3, 5, 2, 4, 1].entries()) {
      const session = await makeSession({
        classTypeId: classType.id,
        trainerUserId: trainer.id,
        roomId: room.id,
        startsAt: new Date(`2026-05-0${idx + 1}T10:00:00Z`),
        capacity: 10,
      });
      seedSessions.push({ id: session.id, bookings: count });
      for (let i = 0; i < count; i += 1) {
        const { profile, pkg } = await makeClientWithPackage(
          classType.id,
          packageType.id,
          12,
          `top-${idx}-${i}`,
        );
        await makeBooking({
          sessionId: session.id,
          clientProfileId: profile.id,
          clientPackageId: pkg.id,
          createdAt: new Date(`2026-05-0${idx + 1}T08:00:00Z`),
        });
      }
    }

    asAdmin();
    const response = await GET_DETAIL(
      req("/api/reports/bookings/detail", {
        from: "2026-05-01T00:00:00Z",
        to: "2026-05-08T00:00:00Z",
        period: "week",
      }),
    );
    const body = (await response.json()) as DetailResponse;
    expect(body.topSessions).toHaveLength(5);
    expect(body.topSessions.map((s) => s.bookedCount)).toEqual([5, 4, 3, 2, 1]);
  });

  it("counts waitlist entries scoped to sessions in the period", async () => {
    const { classType, trainer, room } = await ensureFixtures();
    const inSession = await makeSession({
      classTypeId: classType.id,
      trainerUserId: trainer.id,
      roomId: room.id,
      startsAt: new Date("2026-05-04T10:00:00Z"),
      capacity: 6,
    });
    const outSession = await makeSession({
      classTypeId: classType.id,
      trainerUserId: trainer.id,
      roomId: room.id,
      startsAt: new Date("2026-06-04T10:00:00Z"),
      capacity: 6,
    });
    for (let i = 0; i < 3; i += 1) {
      const client = await prisma.user.create({
        data: {
          email: `wl-${i}@test.local`,
          firstName: "WL",
          lastName: String(i),
          role: "CLIENT",
        },
      });
      const profile = await prisma.clientProfile.create({
        data: { userId: client.id },
      });
      await prisma.waitlistEntry.create({
        data: {
          sessionId: inSession.id,
          clientProfileId: profile.id,
          position: i,
        },
      });
    }
    // One waitlist entry on a session outside the window — must not count.
    {
      const client = await prisma.user.create({
        data: {
          email: "wl-out@test.local",
          firstName: "WL",
          lastName: "Out",
          role: "CLIENT",
        },
      });
      const profile = await prisma.clientProfile.create({
        data: { userId: client.id },
      });
      await prisma.waitlistEntry.create({
        data: {
          sessionId: outSession.id,
          clientProfileId: profile.id,
          position: 0,
        },
      });
    }

    asAdmin();
    const response = await GET_DETAIL(
      req("/api/reports/bookings/detail", {
        from: "2026-05-01T00:00:00Z",
        to: "2026-05-08T00:00:00Z",
        period: "week",
      }),
    );
    const body = (await response.json()) as DetailResponse;
    expect(body.headline.waitlistCount).toBe(3);
  });

  it("is forbidden for TRAINER callers", async () => {
    asTrainer();
    const response = await GET_DETAIL(
      req("/api/reports/bookings/detail", {
        from: "2026-05-01T00:00:00Z",
        to: "2026-05-08T00:00:00Z",
        period: "week",
      }),
    );
    expect(response.status).toBe(403);
  });
});
