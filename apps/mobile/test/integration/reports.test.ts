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

import { GET as GET_ATTENDANCE } from "@/app/api/reports/attendance/+api";
import { GET as GET_UTILIZATION } from "@/app/api/reports/utilization/+api";
import { prisma } from "@/lib/server/prisma";
import { now, nowMs } from "@/lib/now";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

async function seedReformerWithTrainer() {
  const trainer = await prisma.user.create({
    data: { email: "trainer@test.local", fullName: "Trainer", role: "TRAINER" },
  });
  const reformer = await prisma.classType.create({
    data: { name: "Reformer", maxClients: 6, durationMins: 60 },
  });
  return { trainer, reformer };
}

async function makeClient(email: string) {
  const user = await prisma.user.create({
    data: { email, fullName: email, role: "CLIENT" },
  });
  const profile = await prisma.clientProfile.create({
    data: { userId: user.id },
  });
  return { user, profile };
}

async function makeSession(opts: {
  classTypeId: string;
  trainerUserId: string;
  startsAt: Date;
  capacity?: number;
}) {
  return prisma.session.create({
    data: {
      classTypeId: opts.classTypeId,
      trainerUserId: opts.trainerUserId,
      startsAt: opts.startsAt,
      endsAt: new Date(opts.startsAt.getTime() + HOUR_MS),
      capacity: opts.capacity ?? 6,
      isActive: true,
      status: "SCHEDULED",
    },
  });
}

function asAdmin() {
  setMockUser({
    id: "admin-1",
    role: "ADMIN",
    email: "admin@test.local",
    isActive: true,
    clientProfile: null,
  });
}

function asClient() {
  setMockUser({
    id: "client-1",
    role: "CLIENT",
    email: "client@test.local",
    isActive: true,
    clientProfile: { id: "p-1" },
  });
}

function reportRequest(path: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return new Request(`http://test.local${path}?${qs}`);
}

describe("reports", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  describe("attendance", () => {
    it("returns an empty data array when no sessions exist in the timeframe", async () => {
      asAdmin();
      const response = await GET_ATTENDANCE(
        reportRequest("/api/reports/attendance", {
          from: "2026-07-01",
          to: "2026-08-01",
          period: "day",
        }),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as { data: unknown[] };
      expect(body.data).toEqual([]);
    });

    it("aggregates active bookings per day bucket", async () => {
      const { trainer, reformer } = await seedReformerWithTrainer();
      const c1 = await makeClient("c1@test.local");
      const c2 = await makeClient("c2@test.local");
      const c3 = await makeClient("c3@test.local");
      const session = await makeSession({
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt: new Date("2026-07-15T10:00:00Z"),
      });
      await prisma.booking.createMany({
        data: [
          { sessionId: session.id, clientProfileId: c1.profile.id },
          { sessionId: session.id, clientProfileId: c2.profile.id },
          {
            sessionId: session.id,
            clientProfileId: c3.profile.id,
            canceledAt: now(),
          },
        ],
      });

      asAdmin();
      const response = await GET_ATTENDANCE(
        reportRequest("/api/reports/attendance", {
          from: "2026-07-01",
          to: "2026-08-01",
          period: "day",
        }),
      );
      const body = (await response.json()) as {
        data: { period: string; bookings: number }[];
      };
      expect(body.data).toEqual([{ period: "2026-07-15", bookings: 2 }]);
    });

    it("excludes sessions outside the from–to window", async () => {
      const { trainer, reformer } = await seedReformerWithTrainer();
      const c = await makeClient("inside@test.local");
      const inside = await makeSession({
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt: new Date("2026-07-15T10:00:00Z"),
      });
      const outside = await makeSession({
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt: new Date("2026-08-15T10:00:00Z"),
      });
      await prisma.booking.create({
        data: { sessionId: inside.id, clientProfileId: c.profile.id },
      });
      await prisma.booking.create({
        data: { sessionId: outside.id, clientProfileId: c.profile.id },
      });

      asAdmin();
      const response = await GET_ATTENDANCE(
        reportRequest("/api/reports/attendance", {
          from: "2026-07-01",
          to: "2026-08-01",
          period: "day",
        }),
      );
      const body = (await response.json()) as {
        data: { period: string; bookings: number }[];
      };
      expect(body.data).toEqual([{ period: "2026-07-15", bookings: 1 }]);
    });

    it("is forbidden for client callers", async () => {
      asClient();
      const response = await GET_ATTENDANCE(
        reportRequest("/api/reports/attendance", {
          from: "2026-07-01",
          to: "2026-08-01",
          period: "day",
        }),
      );
      expect(response.status).toBe(403);
    });
  });

  describe("utilization", () => {
    it("computes utilization as booked / capacity per bucket", async () => {
      const { trainer, reformer } = await seedReformerWithTrainer();
      const c1 = await makeClient("u1@test.local");
      const c2 = await makeClient("u2@test.local");
      const session = await makeSession({
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt: new Date("2026-07-15T10:00:00Z"),
        capacity: 4,
      });
      await prisma.booking.create({
        data: { sessionId: session.id, clientProfileId: c1.profile.id },
      });
      await prisma.booking.create({
        data: { sessionId: session.id, clientProfileId: c2.profile.id },
      });

      asAdmin();
      const response = await GET_UTILIZATION(
        reportRequest("/api/reports/utilization", {
          from: "2026-07-01",
          to: "2026-08-01",
          period: "day",
        }),
      );
      const body = (await response.json()) as {
        data: { period: string; totalBooked: number; totalCapacity: number; utilization: number }[];
      };
      expect(body.data).toEqual([
        {
          period: "2026-07-15",
          totalBooked: 2,
          totalCapacity: 4,
          utilization: 0.5,
        },
      ]);
    });

    it("aggregates capacity and bookings across multiple sessions in the same bucket", async () => {
      const { trainer, reformer } = await seedReformerWithTrainer();
      const c = await makeClient("multi@test.local");
      const sessionA = await makeSession({
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt: new Date("2026-07-15T08:00:00Z"),
        capacity: 6,
      });
      const sessionB = await makeSession({
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt: new Date("2026-07-15T18:00:00Z"),
        capacity: 4,
      });
      await prisma.booking.create({
        data: { sessionId: sessionA.id, clientProfileId: c.profile.id },
      });
      await prisma.booking.create({
        data: { sessionId: sessionB.id, clientProfileId: c.profile.id },
      });

      asAdmin();
      const response = await GET_UTILIZATION(
        reportRequest("/api/reports/utilization", {
          from: "2026-07-01",
          to: "2026-08-01",
          period: "day",
        }),
      );
      const body = (await response.json()) as {
        data: { period: string; totalBooked: number; totalCapacity: number; utilization: number }[];
      };
      // 2 booked / 10 capacity = 0.2
      expect(body.data).toEqual([
        {
          period: "2026-07-15",
          totalBooked: 2,
          totalCapacity: 10,
          utilization: 0.2,
        },
      ]);
    });

    it("is forbidden for client callers", async () => {
      asClient();
      const response = await GET_UTILIZATION(
        reportRequest("/api/reports/utilization", {
          from: "2026-07-01",
          to: "2026-08-01",
          period: "day",
        }),
      );
      expect(response.status).toBe(403);
    });
  });
});
