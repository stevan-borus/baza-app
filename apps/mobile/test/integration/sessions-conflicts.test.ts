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

vi.mock("@/lib/server/notifications", () => ({
  createSystemNotification: vi.fn(async () => undefined),
}));

import { POST as POST_SESSION } from "@/app/api/sessions/+api";
import { PATCH as PATCH_SESSION } from "@/app/api/sessions/[id]/+api";
import { POST as POST_RECURRING } from "@/app/api/sessions/recurring/+api";
import { prisma } from "@/lib/server/prisma";
import { now, nowMs } from "@/lib/now";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

async function seedCatalog() {
  const trainerA = await prisma.user.create({
    data: { email: "ta@test.local", fullName: "Trainer A", role: "TRAINER" },
  });
  const trainerB = await prisma.user.create({
    data: { email: "tb@test.local", fullName: "Trainer B", role: "TRAINER" },
  });
  const reformer = await prisma.classType.create({
    data: { name: "Reformer", maxClients: 6, durationMins: 60 },
  });
  const room1 = await prisma.studioRoom.create({
    data: { name: "Sala 1", capacity: 6 },
  });
  const room2 = await prisma.studioRoom.create({
    data: { name: "Sala 2", capacity: 6 },
  });
  return { trainerA, trainerB, reformer, room1, room2 };
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

const futureStart = new Date(nowMs() + 2 * DAY_MS);
const futureEnd = new Date(futureStart.getTime() + HOUR_MS);

function jsonRequest(url: string, method: string, body: unknown) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("schedule conflict enforcement", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("POST /api/sessions returns 409 with kind=room when two sessions overlap in the same room", async () => {
    const { trainerA, trainerB, reformer, room1 } = await seedCatalog();
    const existing = await prisma.session.create({
      data: {
        classTypeId: reformer.id,
        trainerUserId: trainerA.id,
        roomId: room1.id,
        startsAt: futureStart,
        endsAt: futureEnd,
        capacity: 6,
        status: "SCHEDULED",
        isActive: true,
      },
    });
    asAdmin();
    const response = await POST_SESSION(
      jsonRequest("http://test.local/api/sessions", "POST", {
        classTypeId: reformer.id,
        trainerUserId: trainerB.id,
        roomId: room1.id,
        startsAt: futureStart.toISOString(),
        endsAt: futureEnd.toISOString(),
        capacity: 6,
      }),
    );
    expect(response.status).toBe(409);
    const body = (await response.json()) as {
      error: string;
      conflict: { kind: string; sessionId: string };
    };
    expect(body.error).toBe("Schedule conflict");
    expect(body.conflict.kind).toBe("room");
    expect(body.conflict.sessionId).toBe(existing.id);
  });

  it("POST /api/sessions returns 409 with kind=trainer when two sessions overlap with the same trainer", async () => {
    const { trainerA, reformer, room1, room2 } = await seedCatalog();
    const existing = await prisma.session.create({
      data: {
        classTypeId: reformer.id,
        trainerUserId: trainerA.id,
        roomId: room1.id,
        startsAt: futureStart,
        endsAt: futureEnd,
        capacity: 6,
        status: "SCHEDULED",
        isActive: true,
      },
    });
    asAdmin();
    const response = await POST_SESSION(
      jsonRequest("http://test.local/api/sessions", "POST", {
        classTypeId: reformer.id,
        trainerUserId: trainerA.id,
        roomId: room2.id,
        startsAt: futureStart.toISOString(),
        endsAt: futureEnd.toISOString(),
        capacity: 6,
      }),
    );
    expect(response.status).toBe(409);
    const body = (await response.json()) as {
      conflict: { kind: string; sessionId: string };
    };
    expect(body.conflict.kind).toBe("trainer");
    expect(body.conflict.sessionId).toBe(existing.id);
  });

  it("POST /api/sessions succeeds when the times do not overlap (back-to-back is fine)", async () => {
    const { trainerA, reformer, room1 } = await seedCatalog();
    await prisma.session.create({
      data: {
        classTypeId: reformer.id,
        trainerUserId: trainerA.id,
        roomId: room1.id,
        startsAt: futureStart,
        endsAt: futureEnd,
        capacity: 6,
        status: "SCHEDULED",
        isActive: true,
      },
    });
    asAdmin();
    const response = await POST_SESSION(
      jsonRequest("http://test.local/api/sessions", "POST", {
        classTypeId: reformer.id,
        trainerUserId: trainerA.id,
        roomId: room1.id,
        startsAt: futureEnd.toISOString(),
        endsAt: new Date(futureEnd.getTime() + HOUR_MS).toISOString(),
        capacity: 6,
      }),
    );
    expect(response.status).toBe(201);
    expect(
      await prisma.session.count({ where: { roomId: room1.id } }),
    ).toBe(2);
  });

  it("PATCH /api/sessions/:id does NOT self-conflict when editing a session in place", async () => {
    const { trainerA, reformer, room1 } = await seedCatalog();
    const session = await prisma.session.create({
      data: {
        classTypeId: reformer.id,
        trainerUserId: trainerA.id,
        roomId: room1.id,
        startsAt: futureStart,
        endsAt: futureEnd,
        capacity: 6,
        status: "SCHEDULED",
        isActive: true,
      },
    });
    asAdmin();
    const response = await PATCH_SESSION(
      jsonRequest(`http://test.local/api/sessions/${session.id}`, "PATCH", {
        capacity: 12,
      }),
      { id: session.id },
    );
    expect(response.status).toBe(200);
  });

  it("does NOT block when an overlapping session is CANCELED", async () => {
    const { trainerA, reformer, room1 } = await seedCatalog();
    await prisma.session.create({
      data: {
        classTypeId: reformer.id,
        trainerUserId: trainerA.id,
        roomId: room1.id,
        startsAt: futureStart,
        endsAt: futureEnd,
        capacity: 6,
        status: "CANCELED",
        isActive: true,
      },
    });
    asAdmin();
    const response = await POST_SESSION(
      jsonRequest("http://test.local/api/sessions", "POST", {
        classTypeId: reformer.id,
        trainerUserId: trainerA.id,
        roomId: room1.id,
        startsAt: futureStart.toISOString(),
        endsAt: futureEnd.toISOString(),
        capacity: 6,
      }),
    );
    expect(response.status).toBe(201);
  });

  it("POST /api/sessions/recurring refuses with 409 when the first generated slot conflicts", async () => {
    const { trainerA, reformer, room1 } = await seedCatalog();
    // Block the first Mon slot of the recurring series we're about to create.
    const currentInstant = now();
    const daysUntilMon = (1 - currentInstant.getUTCDay() + 7) % 7 || 7;
    const nextMon = new Date(currentInstant);
    nextMon.setUTCDate(currentInstant.getUTCDate() + daysUntilMon);
    nextMon.setUTCHours(10, 0, 0, 0);
    const blockEnd = new Date(nextMon.getTime() + HOUR_MS);
    await prisma.session.create({
      data: {
        classTypeId: reformer.id,
        trainerUserId: trainerA.id,
        roomId: room1.id,
        startsAt: nextMon,
        endsAt: blockEnd,
        capacity: 6,
        status: "SCHEDULED",
        isActive: true,
      },
    });

    asAdmin();
    const response = await POST_RECURRING(
      jsonRequest("http://test.local/api/sessions/recurring", "POST", {
        classTypeId: reformer.id,
        trainerUserId: trainerA.id,
        roomId: room1.id,
        startsAt: nextMon.toISOString(),
        durationMins: 60,
        capacity: 6,
        weekCount: 4,
        weekdays: [1],
      }),
    );
    expect(response.status).toBe(409);
    const body = (await response.json()) as {
      error: string;
      conflicts: Array<{ kind: string; sessionId: string; occurrenceStartsAt: string }>;
      conflictCount: number;
      totalOccurrences: number;
    };
    expect(body.error).toBe("Schedule conflict");
    expect(body.conflicts.length).toBeGreaterThanOrEqual(1);
    expect(body.conflicts[0].kind).toBe("room");
    expect(body.conflicts[0].occurrenceStartsAt).toBe(nextMon.toISOString());
    expect(body.totalOccurrences).toBe(4);
    // No RecurringSchedule or new sessions persisted.
    expect(await prisma.recurringSchedule.count()).toBe(0);
    expect(await prisma.session.count()).toBe(1);
  });

  it("POST /api/sessions/recurring detects a conflict on a LATER occurrence, not just the first (round-9 regression)", async () => {
    // Round-9 fix: previously the recurring create only checked the first
    // generated slot. A trainer one-off booked on, say, Monday week 3 would
    // silently conflict and get scheduled in two rooms simultaneously.
    const { trainerA, reformer, room1 } = await seedCatalog();
    const currentInstant = now();
    const daysUntilMon = (1 - currentInstant.getUTCDay() + 7) % 7 || 7;
    const week0Mon = new Date(currentInstant);
    week0Mon.setUTCDate(currentInstant.getUTCDate() + daysUntilMon);
    week0Mon.setUTCHours(10, 0, 0, 0);
    // Block the THIRD Mon slot (week index 2). The first two slots are clear.
    const week2Mon = new Date(week0Mon.getTime() + 14 * DAY_MS);
    await prisma.session.create({
      data: {
        classTypeId: reformer.id,
        trainerUserId: trainerA.id,
        roomId: room1.id,
        startsAt: week2Mon,
        endsAt: new Date(week2Mon.getTime() + HOUR_MS),
        capacity: 6,
        status: "SCHEDULED",
        isActive: true,
      },
    });

    asAdmin();
    const response = await POST_RECURRING(
      jsonRequest("http://test.local/api/sessions/recurring", "POST", {
        classTypeId: reformer.id,
        trainerUserId: trainerA.id,
        roomId: room1.id,
        startsAt: week0Mon.toISOString(),
        durationMins: 60,
        capacity: 6,
        weekCount: 4,
        weekdays: [1],
      }),
    );
    expect(response.status).toBe(409);
    const body = (await response.json()) as {
      conflicts: Array<{
        kind: string;
        occurrenceStartsAt: string;
        existingRoomName: string | null;
      }>;
      conflictCount: number;
      totalOccurrences: number;
    };
    expect(body.conflictCount).toBe(1);
    expect(body.totalOccurrences).toBe(4);
    expect(body.conflicts).toHaveLength(1);
    expect(body.conflicts[0].occurrenceStartsAt).toBe(week2Mon.toISOString());
    expect(body.conflicts[0].existingRoomName).toBe("Sala 1");
    // Series was rejected wholesale — no new RecurringSchedule, no new sessions.
    expect(await prisma.recurringSchedule.count()).toBe(0);
    expect(await prisma.session.count()).toBe(1);
  });

  it("POST /api/sessions/recurring caps the conflicts list at 3 but reports the total count", async () => {
    const { trainerA, reformer, room1 } = await seedCatalog();
    const currentInstant = now();
    const daysUntilMon = (1 - currentInstant.getUTCDay() + 7) % 7 || 7;
    const week0Mon = new Date(currentInstant);
    week0Mon.setUTCDate(currentInstant.getUTCDate() + daysUntilMon);
    week0Mon.setUTCHours(10, 0, 0, 0);
    // Block all 5 Mon slots.
    for (let week = 0; week < 5; week += 1) {
      const blockStart = new Date(week0Mon.getTime() + week * 7 * DAY_MS);
      await prisma.session.create({
        data: {
          classTypeId: reformer.id,
          trainerUserId: trainerA.id,
          roomId: room1.id,
          startsAt: blockStart,
          endsAt: new Date(blockStart.getTime() + HOUR_MS),
          capacity: 6,
          status: "SCHEDULED",
          isActive: true,
        },
      });
    }

    asAdmin();
    const response = await POST_RECURRING(
      jsonRequest("http://test.local/api/sessions/recurring", "POST", {
        classTypeId: reformer.id,
        trainerUserId: trainerA.id,
        roomId: room1.id,
        startsAt: week0Mon.toISOString(),
        durationMins: 60,
        capacity: 6,
        weekCount: 5,
        weekdays: [1],
      }),
    );
    expect(response.status).toBe(409);
    const body = (await response.json()) as {
      conflicts: unknown[];
      conflictCount: number;
      totalOccurrences: number;
    };
    expect(body.conflicts).toHaveLength(3);
    expect(body.conflictCount).toBe(5);
    expect(body.totalOccurrences).toBe(5);
  });
});
