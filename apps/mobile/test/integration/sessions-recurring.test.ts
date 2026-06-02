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

import { POST } from "@/app/api/sessions/recurring/+api";
import { prisma } from "@/lib/server/prisma";

async function seed() {
  const admin = await prisma.user.create({
    data: { email: "admin@test.local", firstName: "Admin", lastName: "Test", role: "ADMIN" },
  });
  const trainer = await prisma.user.create({
    data: { email: "trainer@test.local", firstName: "Trainer", lastName: "Test", role: "TRAINER" },
  });
  const reformer = await prisma.classType.create({
    data: { name: "Reformer pilates", maxClients: 6, durationMins: 60 },
  });
  return { admin, trainer, reformer };
}

function buildJsonRequest(body: unknown) {
  return new Request("http://test.local/api/sessions/recurring", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/sessions/recurring", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("creates 12 sessions for a Mon/Wed/Fri × 4-week series", async () => {
    const { admin, trainer, reformer } = await seed();
    setMockUser({
      id: admin.id,
      role: "ADMIN",
      email: admin.email,
      isActive: true,
      clientProfile: null,
    });

    // Sun 2026-06-07 10:00Z → first slot is Mon 2026-06-08.
    const response = await POST(
      buildJsonRequest({
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt: "2026-06-07T10:00:00.000Z",
        durationMins: 60,
        capacity: 6,
        weekCount: 4,
        weekdays: [1, 3, 5],
      }),
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { count: number; scheduleId: string };
    expect(body.count).toBe(12);

    const sessions = await prisma.session.findMany({
      where: { recurringScheduleId: body.scheduleId },
      orderBy: { startsAt: "asc" },
    });
    expect(sessions).toHaveLength(12);

    // Every session lands on Mon (1), Wed (3), or Fri (5) (UTC).
    const utcDows = sessions.map((s) => s.startsAt.getUTCDay());
    expect(new Set(utcDows)).toEqual(new Set([1, 3, 5]));
  });

  it("skips weekday slots that fall strictly before the anchor (week 0 partial)", async () => {
    const { admin, trainer, reformer } = await seed();
    setMockUser({
      id: admin.id,
      role: "ADMIN",
      email: admin.email,
      isActive: true,
      clientProfile: null,
    });

    // Wed 2026-06-10 10:00Z. Asking Mon/Wed/Fri × 1 week — Mon is in the past
    // relative to anchor, so only Wed + Fri should be created.
    const response = await POST(
      buildJsonRequest({
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt: "2026-06-10T10:00:00.000Z",
        durationMins: 60,
        capacity: 6,
        weekCount: 1,
        weekdays: [1, 3, 5],
      }),
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { count: number; scheduleId: string };
    expect(body.count).toBe(2);

    const sessions = await prisma.session.findMany({
      where: { recurringScheduleId: body.scheduleId },
      orderBy: { startsAt: "asc" },
    });
    expect(sessions.map((s) => s.startsAt.getUTCDay())).toEqual([3, 5]);
  });

  it("preserves the anchor's local hour-of-day across all generated sessions", async () => {
    const { admin, trainer, reformer } = await seed();
    setMockUser({
      id: admin.id,
      role: "ADMIN",
      email: admin.email,
      isActive: true,
      clientProfile: null,
    });

    // Mon 2026-06-08 09:00Z (anchor) — every Mon for 6 weeks at 09:00 wall-clock.
    const response = await POST(
      buildJsonRequest({
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt: "2026-06-08T09:00:00.000Z",
        durationMins: 60,
        capacity: 6,
        weekCount: 6,
        weekdays: [1],
      }),
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { count: number; scheduleId: string };
    expect(body.count).toBe(6);

    const sessions = await prisma.session.findMany({
      where: { recurringScheduleId: body.scheduleId },
      orderBy: { startsAt: "asc" },
    });
    // Every session preserves the anchor's local wall-clock hour:minute.
    const anchorHour = new Date("2026-06-08T09:00:00.000Z").getHours();
    const anchorMinute = new Date("2026-06-08T09:00:00.000Z").getMinutes();
    for (const s of sessions) {
      expect(s.startsAt.getHours()).toBe(anchorHour);
      expect(s.startsAt.getMinutes()).toBe(anchorMinute);
    }
  });

  it("rejects a trainer assigning a series to a different trainer (403)", async () => {
    const { trainer, reformer } = await seed();
    const otherTrainer = await prisma.user.create({
      data: { email: "other@test.local", firstName: "Other", lastName: "Test", role: "TRAINER" },
    });
    setMockUser({
      id: trainer.id,
      role: "TRAINER",
      email: trainer.email,
      isActive: true,
      clientProfile: null,
    });

    const response = await POST(
      buildJsonRequest({
        classTypeId: reformer.id,
        trainerUserId: otherTrainer.id,
        startsAt: "2026-06-08T09:00:00.000Z",
        durationMins: 60,
        capacity: 6,
        weekCount: 1,
        weekdays: [1],
      }),
    );

    expect(response.status).toBe(403);
    const sessionsCreated = await prisma.session.count();
    expect(sessionsCreated).toBe(0);
  });

  it("returns 400 when all selected weekdays fall before the anchor and no sessions can be created", async () => {
    const { admin, trainer, reformer } = await seed();
    setMockUser({
      id: admin.id,
      role: "ADMIN",
      email: admin.email,
      isActive: true,
      clientProfile: null,
    });

    // Anchor is Sat 2026-06-13. Asking for [Mon] weekday × 1 week →
    // the only candidate slot is Mon 2026-06-08, which is before the anchor.
    const response = await POST(
      buildJsonRequest({
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt: "2026-06-13T10:00:00.000Z",
        durationMins: 60,
        capacity: 6,
        weekCount: 1,
        weekdays: [1],
      }),
    );

    expect(response.status).toBe(400);
    expect(await prisma.recurringSchedule.count()).toBe(0);
    expect(await prisma.session.count()).toBe(0);
  });
});
