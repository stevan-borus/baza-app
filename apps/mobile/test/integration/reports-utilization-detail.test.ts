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

import { GET as GET_HEATMAP } from "@/app/api/reports/utilization/heatmap/+api";
import { GET as GET_TIME_SERIES } from "@/app/api/reports/utilization/time-series/+api";
import { prisma } from "@/lib/server/prisma";

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

type HeatmapCell = {
  dayOfWeek: number;
  timeBucket: "morning" | "midday" | "afternoon" | "evening";
  booked: number;
  capacity: number;
  utilization: number;
};

async function seedSessionWithBookings(opts: {
  startsAt: Date;
  capacity: number;
  booked: number;
}) {
  const reformer =
    (await prisma.classType.findFirst({ where: { name: "Reformer" } })) ??
    (await prisma.classType.create({
      data: { name: "Reformer", maxClients: 6, durationMins: 60 },
    }));
  const trainer =
    (await prisma.user.findFirst({ where: { email: "t@test.local" } })) ??
    (await prisma.user.create({
      data: { email: "t@test.local", firstName: "T", lastName: "Test", role: "TRAINER" },
    }));
  const sala =
    (await prisma.studioRoom.findFirst({ where: { name: "Sala" } })) ??
    (await prisma.studioRoom.create({
      data: { name: "Sala", capacity: opts.capacity },
    }));
  const endsAt = new Date(opts.startsAt.getTime() + 60 * 60 * 1000);
  const session = await prisma.session.create({
    data: {
      classTypeId: reformer.id,
      roomId: sala.id,
      trainerUserId: trainer.id,
      startsAt: opts.startsAt,
      endsAt,
      capacity: opts.capacity,
      status: "SCHEDULED",
    },
  });

  const pkgType =
    (await prisma.packageType.findFirst()) ??
    (await prisma.packageType.create({
      data: {
        name: "Reformer 12",
        sessionCount: 12,
        validityDays: 365,
        lateCancelHours: 12,
        classTypeId: reformer.id,
      },
    }));

  for (let i = 0; i < opts.booked; i += 1) {
    const client = await prisma.user.create({
      data: {
        email: `client-${session.id}-${i}@test.local`,
        firstName: "Client",
        lastName: String(i),
        role: "CLIENT",
      },
    });
    const profile = await prisma.clientProfile.create({
      data: { userId: client.id },
    });
    const pkg = await prisma.clientPackage.create({
      data: {
        clientProfileId: profile.id,
        packageTypeId: pkgType.id,
        classTypeId: reformer.id,
        lateCancelHours: 12,
        startsAt: new Date("2026-01-01T00:00:00Z"),
        expiresAt: new Date("2030-01-01T00:00:00Z"),
        sessionsRemaining: 12,
      },
    });
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: profile.id,
        clientPackageId: pkg.id,
      },
    });
  }
  return session;
}

describe("reports/utilization/heatmap", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("always returns 28 cells (7 days × 4 buckets) even when empty", async () => {
    asAdmin();
    const response = await GET_HEATMAP(
      req("/api/reports/utilization/heatmap", {
        from: "2026-07-01T00:00:00Z",
        to: "2026-07-08T00:00:00Z",
        period: "week",
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      success: boolean;
      cells: HeatmapCell[];
    };
    expect(body.success).toBe(true);
    expect(body.cells).toHaveLength(28);
    // All cells empty when no sessions exist.
    expect(body.cells.every((c) => c.booked === 0 && c.capacity === 0)).toBe(
      true,
    );
    // Every (dow, bucket) pair represented exactly once.
    const seen = new Set(body.cells.map((c) => `${c.dayOfWeek}:${c.timeBucket}`));
    expect(seen.size).toBe(28);
  });

  it("bins sessions by day-of-week and time-of-day bucket", async () => {
    // 2026-07-07 is a Tuesday (UTC). 10:00 → morning bucket.
    await seedSessionWithBookings({
      startsAt: new Date("2026-07-07T10:00:00Z"),
      capacity: 10,
      booked: 8,
    });
    // 2026-07-11 is a Saturday (UTC). 19:30 → evening bucket.
    await seedSessionWithBookings({
      startsAt: new Date("2026-07-11T19:30:00Z"),
      capacity: 5,
      booked: 5,
    });

    asAdmin();
    const response = await GET_HEATMAP(
      req("/api/reports/utilization/heatmap", {
        from: "2026-07-01T00:00:00Z",
        to: "2026-07-15T00:00:00Z",
        period: "month",
      }),
    );
    const body = (await response.json()) as { cells: HeatmapCell[] };
    const tueMorning = body.cells.find(
      (c) => c.dayOfWeek === 2 && c.timeBucket === "morning",
    );
    const satEvening = body.cells.find(
      (c) => c.dayOfWeek === 6 && c.timeBucket === "evening",
    );
    expect(tueMorning).toEqual({
      dayOfWeek: 2,
      timeBucket: "morning",
      booked: 8,
      capacity: 10,
      utilization: 0.8,
    });
    expect(satEvening).toEqual({
      dayOfWeek: 6,
      timeBucket: "evening",
      booked: 5,
      capacity: 5,
      utilization: 1,
    });
    // Every other cell is empty.
    const filled = body.cells.filter((c) => c.capacity > 0);
    expect(filled).toHaveLength(2);
  });

  it("drops sessions outside 06:00–22:00 UTC", async () => {
    // 04:00 UTC — pre-morning, must be dropped.
    await seedSessionWithBookings({
      startsAt: new Date("2026-07-07T04:00:00Z"),
      capacity: 10,
      booked: 5,
    });
    asAdmin();
    const response = await GET_HEATMAP(
      req("/api/reports/utilization/heatmap", {
        from: "2026-07-01T00:00:00Z",
        to: "2026-07-15T00:00:00Z",
        period: "month",
      }),
    );
    const body = (await response.json()) as { cells: HeatmapCell[] };
    const filled = body.cells.filter((c) => c.capacity > 0);
    expect(filled).toHaveLength(0);
  });

  it("is forbidden for TRAINER callers", async () => {
    asTrainer();
    const response = await GET_HEATMAP(
      req("/api/reports/utilization/heatmap", {
        from: "2026-07-01T00:00:00Z",
        to: "2026-07-08T00:00:00Z",
        period: "week",
      }),
    );
    expect(response.status).toBe(403);
  });
});

describe("reports/utilization/time-series", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("returns 7 daily buckets and aggregates booked/capacity correctly", async () => {
    // Two sessions on day 1 (Jul 1).
    await seedSessionWithBookings({
      startsAt: new Date("2026-07-01T10:00:00Z"),
      capacity: 6,
      booked: 4,
    });
    await seedSessionWithBookings({
      startsAt: new Date("2026-07-01T18:00:00Z"),
      capacity: 6,
      booked: 6,
    });
    // One session on day 3.
    await seedSessionWithBookings({
      startsAt: new Date("2026-07-03T12:00:00Z"),
      capacity: 8,
      booked: 2,
    });

    asAdmin();
    const response = await GET_TIME_SERIES(
      req("/api/reports/utilization/time-series", {
        from: "2026-07-01T00:00:00Z",
        to: "2026-07-08T00:00:00Z",
        period: "week",
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      success: boolean;
      buckets: {
        bucketStart: string;
        bucketEnd: string;
        booked: number;
        capacity: number;
        utilization: number;
      }[];
    };
    expect(body.success).toBe(true);
    expect(body.buckets).toHaveLength(7);
    // Day 1: 4 + 6 = 10 booked / 12 capacity = 0.8333…
    expect(body.buckets[0].booked).toBe(10);
    expect(body.buckets[0].capacity).toBe(12);
    expect(body.buckets[0].utilization).toBeCloseTo(0.8333, 4);
    // Day 2: empty.
    expect(body.buckets[1].booked).toBe(0);
    expect(body.buckets[1].capacity).toBe(0);
    expect(body.buckets[1].utilization).toBe(0);
    // Day 3: 2/8 = 0.25.
    expect(body.buckets[2].booked).toBe(2);
    expect(body.buckets[2].capacity).toBe(8);
    expect(body.buckets[2].utilization).toBe(0.25);
  });

  it("emits monthly buckets when period=year", async () => {
    asAdmin();
    const response = await GET_TIME_SERIES(
      req("/api/reports/utilization/time-series", {
        from: "2026-01-01T00:00:00Z",
        to: "2027-01-01T00:00:00Z",
        period: "year",
      }),
    );
    const body = (await response.json()) as {
      buckets: { bucketStart: string; bucketEnd: string }[];
    };
    expect(body.buckets).toHaveLength(12);
    expect(body.buckets[0].bucketStart).toBe("2026-01-01T00:00:00.000Z");
    expect(body.buckets[11].bucketEnd).toBe("2027-01-01T00:00:00.000Z");
  });

  it("is forbidden for TRAINER callers", async () => {
    asTrainer();
    const response = await GET_TIME_SERIES(
      req("/api/reports/utilization/time-series", {
        from: "2026-07-01T00:00:00Z",
        to: "2026-07-08T00:00:00Z",
        period: "week",
      }),
    );
    expect(response.status).toBe(403);
  });
});
