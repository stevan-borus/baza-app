/**
 * Calendar-aligned period window regression.
 *
 * Before the round-9 fix, the period pill produced rolling 30/90/365-day
 * windows ending at "today UTC + 1 day". On the iskorišćenost screen that
 * silently excluded SCHEDULED sessions later in the current calendar month
 * — so a studio mid-May 2026 would see Mesec = "0 od 12 termina" even
 * though the second half of May was fully booked.
 *
 * The fix moved windows to calendar alignment. This test pins the contract
 * at the API layer: with a calendar Mesec from/to, the utilization endpoint
 * MUST include sessions later in the same calendar month.
 *
 * NOTE: the endpoint itself accepts arbitrary from/to — it has no knowledge
 * of the pill semantics. What we're protecting against is "someone reverts
 * the period pill to rolling-30-days and the iskorišćenost UI silently
 * starts hiding upcoming sessions again". The pill's window math is unit-
 * tested in `test/unit/use-period-pill.test.ts`; this integration test
 * exercises the endpoint contract that pill output flows into.
 */
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

import { GET as GET_UTILIZATION } from "@/app/api/reports/utilization/+api";
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

function req(path: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return new Request(`http://test.local${path}?${qs}`);
}

async function seedSession(startsAt: Date, capacity = 6) {
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
      data: { name: "Sala", capacity },
    }));
  return prisma.session.create({
    data: {
      classTypeId: reformer.id,
      roomId: sala.id,
      trainerUserId: trainer.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
      capacity,
      status: "SCHEDULED",
    },
  });
}

describe("reports/utilization — calendar-aligned month window", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("includes a session scheduled later in the same calendar month (regression)", async () => {
    asAdmin();
    // Anchor matches integration env.setup.ts: 2026-05-09T10:00:00Z.
    // Seed a session 11 days later — still inside calendar May 2026.
    await seedSession(new Date("2026-05-20T08:00:00Z"), 6);

    // Calendar Mesec window for an anchor mid-May.
    const response = await GET_UTILIZATION(
      req("/api/reports/utilization", {
        from: "2026-05-01T00:00:00Z",
        to: "2026-06-01T00:00:00Z",
        period: "month",
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      success: boolean;
      data: Array<{
        period: string;
        totalCapacity: number;
        totalBooked: number;
        utilization: number;
      }>;
    };
    expect(body.success).toBe(true);

    const totalCapacity = body.data.reduce((s, r) => s + r.totalCapacity, 0);
    // The seeded session contributes capacity 6. If the endpoint were called
    // with an OLD rolling-30d window like [2026-04-09, 2026-05-10), the May 20
    // session would be excluded and this would be 0 — exactly the bug.
    expect(totalCapacity).toBe(6);
  });

  it("excludes sessions outside the calendar month boundary", async () => {
    asAdmin();
    // Sessions on either side of the window — Apr 30 (before) and Jun 1 (the
    // exclusive upper bound). Neither should count toward May utilization.
    await seedSession(new Date("2026-04-30T08:00:00Z"), 6);
    await seedSession(new Date("2026-06-01T08:00:00Z"), 6);

    const response = await GET_UTILIZATION(
      req("/api/reports/utilization", {
        from: "2026-05-01T00:00:00Z",
        to: "2026-06-01T00:00:00Z",
        period: "month",
      }),
    );
    const body = (await response.json()) as {
      success: boolean;
      data: Array<{ totalCapacity: number }>;
    };
    const totalCapacity = body.data.reduce((s, r) => s + r.totalCapacity, 0);
    expect(totalCapacity).toBe(0);
  });
});
