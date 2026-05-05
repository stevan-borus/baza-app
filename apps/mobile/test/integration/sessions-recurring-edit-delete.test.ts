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

import { PATCH, DELETE } from "@/app/api/sessions/recurring/[id]/+api";
import { prisma } from "@/lib/server/prisma";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

async function seedSeriesWith(opts?: { withBooking?: boolean }) {
  const trainer = await prisma.user.create({
    data: { email: "trainer@test.local", fullName: "T", role: "TRAINER" },
  });
  const reformer = await prisma.classType.create({
    data: { name: "Reformer", maxClients: 6, durationMins: 60 },
  });
  const schedule = await prisma.recurringSchedule.create({
    data: {
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      weekdays: [1, 3, 5],
      timeOfDayMins: 600,
      durationMins: 60,
      capacity: 6,
      isActive: true,
    },
  });
  // Two future child sessions.
  const futureA = new Date(Date.now() + 2 * DAY_MS);
  const futureB = new Date(Date.now() + 4 * DAY_MS);
  const sessionA = await prisma.session.create({
    data: {
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      startsAt: futureA,
      endsAt: new Date(futureA.getTime() + HOUR_MS),
      capacity: 6,
      isActive: true,
      status: "SCHEDULED",
      recurringScheduleId: schedule.id,
    },
  });
  await prisma.session.create({
    data: {
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      startsAt: futureB,
      endsAt: new Date(futureB.getTime() + HOUR_MS),
      capacity: 6,
      isActive: true,
      status: "SCHEDULED",
      recurringScheduleId: schedule.id,
    },
  });
  if (opts?.withBooking) {
    const client = await prisma.user.create({
      data: { email: "c@test.local", fullName: "C", role: "CLIENT" },
    });
    const profile = await prisma.clientProfile.create({
      data: { userId: client.id },
    });
    await prisma.booking.create({
      data: { sessionId: sessionA.id, clientProfileId: profile.id },
    });
  }
  return { trainer, reformer, schedule };
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

describe("PATCH + DELETE /api/sessions/recurring/:id", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("PATCH propagates a capacity bump to all future child sessions", async () => {
    const { schedule } = await seedSeriesWith();
    asAdmin();
    const response = await PATCH(
      new Request(`http://test.local/api/sessions/recurring/${schedule.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ capacity: 10 }),
      }),
      { id: schedule.id },
    );
    expect(response.status).toBe(200);
    const reloaded = await prisma.recurringSchedule.findUnique({
      where: { id: schedule.id },
    });
    expect(reloaded?.capacity).toBe(10);
    const childSessions = await prisma.session.findMany({
      where: { recurringScheduleId: schedule.id },
    });
    expect(childSessions).toHaveLength(2);
    expect(childSessions.every((s) => s.capacity === 10)).toBe(true);
  });

  it("PATCH can deactivate a series with no future bookings", async () => {
    const { schedule } = await seedSeriesWith();
    asAdmin();
    const response = await PATCH(
      new Request(`http://test.local/api/sessions/recurring/${schedule.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      }),
      { id: schedule.id },
    );
    expect(response.status).toBe(200);
    const reloaded = await prisma.recurringSchedule.findUnique({
      where: { id: schedule.id },
    });
    expect(reloaded?.isActive).toBe(false);
  });

  it("PATCH refuses to deactivate a series whose future sessions still have active bookings (409)", async () => {
    const { schedule } = await seedSeriesWith({ withBooking: true });
    asAdmin();
    const response = await PATCH(
      new Request(`http://test.local/api/sessions/recurring/${schedule.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      }),
      { id: schedule.id },
    );
    expect(response.status).toBe(409);
    const reloaded = await prisma.recurringSchedule.findUnique({
      where: { id: schedule.id },
    });
    expect(reloaded?.isActive).toBe(true);
  });

  it("PATCH returns 404 for an unknown schedule id", async () => {
    asAdmin();
    const response = await PATCH(
      new Request("http://test.local/api/sessions/recurring/x", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ capacity: 99 }),
      }),
      { id: "00000000-0000-0000-0000-000000000000" },
    );
    expect(response.status).toBe(404);
  });

  it("DELETE cascades to all child sessions when none are booked", async () => {
    const { schedule } = await seedSeriesWith();
    asAdmin();
    const response = await DELETE(
      new Request(`http://test.local/api/sessions/recurring/${schedule.id}`, {
        method: "DELETE",
      }),
      { id: schedule.id },
    );
    expect(response.status).toBe(200);
    expect(
      await prisma.recurringSchedule.findUnique({ where: { id: schedule.id } }),
    ).toBeNull();
    expect(
      await prisma.session.count({ where: { recurringScheduleId: schedule.id } }),
    ).toBe(0);
  });

  it("DELETE is blocked with 409 when any child session has an active booking", async () => {
    const { schedule } = await seedSeriesWith({ withBooking: true });
    asAdmin();
    const response = await DELETE(
      new Request(`http://test.local/api/sessions/recurring/${schedule.id}`, {
        method: "DELETE",
      }),
      { id: schedule.id },
    );
    expect(response.status).toBe(409);
    expect(
      await prisma.recurringSchedule.findUnique({ where: { id: schedule.id } }),
    ).not.toBeNull();
  });
});
