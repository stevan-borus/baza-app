/**
 * Session intensity — the admin-set 1–3 per-occurrence marking.
 *
 * Write path (PATCH /api/sessions/[id]): admins set 1/2/3, clear to null, and
 * every out-of-range or non-admin attempt is rejected. Editable after bookings
 * exist. Read path: the field surfaces on GET /api/sessions/[id] (detail) and
 * GET /api/sessions/availability (client calendar) for the roles that render a
 * card — the omit-in-one-select bug this feature was written to avoid.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

vi.mock("@/lib/server/notifications", async () => (await import("./notifications-mock")).notificationsMock());

import { PATCH, GET as GET_DETAIL } from "@/server/routes/sessions/[id]";
import { GET as GET_AVAILABILITY } from "@/server/routes/sessions/availability";
import { prisma } from "@/lib/server/prisma";
import { now } from "@/lib/now";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

async function seed() {
  const trainer = await prisma.user.create({
    data: { email: "int-tr@test.local", firstName: "Trainer", lastName: "T", role: "TRAINER" },
  });
  const reformer = await prisma.classType.create({
    data: { name: "Reformer pilates", maxClients: 6, durationMins: 60 },
  });
  const room = await prisma.studioRoom.create({
    data: { name: "Sala 1", capacity: 6 },
  });
  // A future session (relative to the pinned anchor) so it shows in availability.
  const startsAt = new Date(now().getTime() + 2 * DAY_MS);
  const session = await prisma.session.create({
    data: {
      classTypeId: reformer.id,
      roomId: room.id,
      trainerUserId: trainer.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + HOUR_MS),
      capacity: 6,
      status: "SCHEDULED",
      isActive: true,
    },
  });
  return { trainer, reformer, room, session };
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

function asTrainer(t: { id: string; email: string }) {
  setMockUser({
    id: t.id,
    role: "TRAINER",
    email: t.email,
    isActive: true,
    clientProfile: null,
  });
}

function patchRequest(sessionId: string, body: unknown) {
  return new Request(`http://test.local/api/sessions/${sessionId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("session intensity write path (PATCH)", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it.each([1, 2, 3])(
    "admin sets intensity=%i on a session",
    async (intensity) => {
      const { session } = await seed();
      asAdmin();

      const res = await PATCH(patchRequest(session.id, { intensity }), {
        id: session.id,
      });
      expect(res.status).toBe(200);
      const reloaded = await prisma.session.findUnique({
        where: { id: session.id },
      });
      expect(reloaded?.intensity).toBe(intensity);
      const body = (await res.json()) as { session: { intensity: number | null } };
      expect(body.session.intensity).toBe(intensity);
    },
  );

  it("admin clears intensity to null", async () => {
    const { session } = await seed();
    await prisma.session.update({
      where: { id: session.id },
      data: { intensity: 3 },
    });
    asAdmin();

    const res = await PATCH(patchRequest(session.id, { intensity: null }), {
      id: session.id,
    });
    expect(res.status).toBe(200);
    const reloaded = await prisma.session.findUnique({
      where: { id: session.id },
    });
    expect(reloaded?.intensity).toBeNull();
    const body = (await res.json()) as { session: { intensity: number | null } };
    expect(body.session.intensity).toBeNull();
  });

  it("editing intensity is allowed after bookings exist", async () => {
    const { reformer, session } = await seed();
    const client = await prisma.user.create({
      data: { email: "int-c@test.local", firstName: "C", lastName: "T", role: "CLIENT" },
    });
    const profile = await prisma.clientProfile.create({ data: { userId: client.id } });
    void reformer;
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: profile.id },
    });
    asAdmin();

    const res = await PATCH(patchRequest(session.id, { intensity: 2 }), {
      id: session.id,
    });
    expect(res.status).toBe(200);
    const reloaded = await prisma.session.findUnique({
      where: { id: session.id },
    });
    expect(reloaded?.intensity).toBe(2);
  });

  it.each([0, 4, -1])(
    "rejects out-of-range intensity=%s (400) and persists nothing",
    async (intensity) => {
      const { session } = await seed();
      asAdmin();

      const res = await PATCH(patchRequest(session.id, { intensity }), {
        id: session.id,
      });
      expect(res.status).toBe(400);
      const reloaded = await prisma.session.findUnique({
        where: { id: session.id },
      });
      expect(reloaded?.intensity).toBeNull();
    },
  );

  it("rejects a non-admin (trainer) setting intensity (403)", async () => {
    const { trainer, session } = await seed();
    asTrainer(trainer);

    const res = await PATCH(patchRequest(session.id, { intensity: 2 }), {
      id: session.id,
    });
    expect(res.status).toBe(403);
    const reloaded = await prisma.session.findUnique({
      where: { id: session.id },
    });
    expect(reloaded?.intensity).toBeNull();
  });
});

describe("session intensity read paths", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("GET /api/sessions/[id] returns the intensity for admin", async () => {
    const { session } = await seed();
    await prisma.session.update({
      where: { id: session.id },
      data: { intensity: 3 },
    });
    asAdmin();

    const res = await GET_DETAIL(
      new Request(`http://test.local/api/sessions/${session.id}`),
      { id: session.id },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { session: { intensity: number | null } };
    expect(body.session.intensity).toBe(3);
  });

  it("GET /api/sessions/availability returns the intensity for a client", async () => {
    const { reformer, session } = await seed();
    await prisma.session.update({
      where: { id: session.id },
      data: { intensity: 2 },
    });
    // A client with an eligible package for the class so the session is visible.
    const client = await prisma.user.create({
      data: { email: "int-av-c@test.local", firstName: "C", lastName: "T", role: "CLIENT" },
    });
    const profile = await prisma.clientProfile.create({ data: { userId: client.id } });
    const pkgType = await prisma.packageType.create({
      data: {
        name: "Reformer 12",
        sessionCount: 12,
        validityDays: 365,
        lateCancelHours: 8,
        classTypes: { create: { classTypeId: reformer.id } },
      },
    });
    await prisma.clientPackage.create({
      data: {
        clientProfileId: profile.id,
        packageTypeId: pkgType.id,
        classTypes: { create: { classTypeId: reformer.id } },
        lateCancelHours: 8,
        startsAt: new Date(now().getTime() - DAY_MS),
        expiresAt: new Date(now().getTime() + 365 * DAY_MS),
        sessionsRemaining: 12,
      },
    });
    setMockUser({
      id: client.id,
      role: "CLIENT",
      email: client.email,
      isActive: true,
      clientProfile: { id: profile.id },
    });

    const month = new Date(session.startsAt).toISOString().slice(0, 7);
    const res = await GET_AVAILABILITY(
      new Request(
        `http://test.local/api/sessions/availability?month=${month}`,
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      sessions: Array<{ id: string; intensity?: number | null }>;
    };
    const row = body.sessions.find((s) => s.id === session.id)!;
    expect(row.intensity).toBe(2);
  });
});
