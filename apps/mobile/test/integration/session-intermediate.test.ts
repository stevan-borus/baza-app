/**
 * Session "intermediate" (Zahtevno) — the admin-set binary per-occurrence marking.
 *
 * Write path (PATCH /api/sessions/[id]): admins set true / false; omitting the
 * field leaves it untouched; a non-admin is rejected. Editable after bookings
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

describe("session intermediate write path (PATCH)", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("admin marks a session intermediate (isIntermediate=true)", async () => {
    const { session } = await seed();
    asAdmin();

    const res = await PATCH(patchRequest(session.id, { isIntermediate: true }), {
      id: session.id,
    });
    expect(res.status).toBe(200);
    const reloaded = await prisma.session.findUnique({
      where: { id: session.id },
    });
    expect(reloaded?.isIntermediate).toBe(true);
    const body = (await res.json()) as { session: { isIntermediate: boolean } };
    expect(body.session.isIntermediate).toBe(true);
  });

  it("admin clears the intermediate marking (isIntermediate=false)", async () => {
    const { session } = await seed();
    await prisma.session.update({
      where: { id: session.id },
      data: { isIntermediate: true },
    });
    asAdmin();

    const res = await PATCH(patchRequest(session.id, { isIntermediate: false }), {
      id: session.id,
    });
    expect(res.status).toBe(200);
    const reloaded = await prisma.session.findUnique({
      where: { id: session.id },
    });
    expect(reloaded?.isIntermediate).toBe(false);
    const body = (await res.json()) as { session: { isIntermediate: boolean } };
    expect(body.session.isIntermediate).toBe(false);
  });

  it("omitting isIntermediate leaves an existing marking untouched", async () => {
    const { session } = await seed();
    await prisma.session.update({
      where: { id: session.id },
      data: { isIntermediate: true },
    });
    asAdmin();

    // A capacity-only edit must not clear the intermediate flag.
    const res = await PATCH(patchRequest(session.id, { capacity: 8 }), {
      id: session.id,
    });
    expect(res.status).toBe(200);
    const reloaded = await prisma.session.findUnique({
      where: { id: session.id },
    });
    expect(reloaded?.isIntermediate).toBe(true);
  });

  it("marking intermediate is allowed after bookings exist", async () => {
    const { session } = await seed();
    const client = await prisma.user.create({
      data: { email: "int-c@test.local", firstName: "C", lastName: "T", role: "CLIENT" },
    });
    const profile = await prisma.clientProfile.create({ data: { userId: client.id } });
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: profile.id },
    });
    asAdmin();

    const res = await PATCH(patchRequest(session.id, { isIntermediate: true }), {
      id: session.id,
    });
    expect(res.status).toBe(200);
    const reloaded = await prisma.session.findUnique({
      where: { id: session.id },
    });
    expect(reloaded?.isIntermediate).toBe(true);
  });

  it("rejects a non-admin (trainer) marking intermediate (403)", async () => {
    const { trainer, session } = await seed();
    asTrainer(trainer);

    const res = await PATCH(patchRequest(session.id, { isIntermediate: true }), {
      id: session.id,
    });
    expect(res.status).toBe(403);
    const reloaded = await prisma.session.findUnique({
      where: { id: session.id },
    });
    expect(reloaded?.isIntermediate).toBe(false);
  });
});

describe("session intermediate read paths", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("GET /api/sessions/[id] returns isIntermediate for admin", async () => {
    const { session } = await seed();
    await prisma.session.update({
      where: { id: session.id },
      data: { isIntermediate: true },
    });
    asAdmin();

    const res = await GET_DETAIL(
      new Request(`http://test.local/api/sessions/${session.id}`),
      { id: session.id },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { session: { isIntermediate: boolean } };
    expect(body.session.isIntermediate).toBe(true);
  });

  it("GET /api/sessions/availability returns isIntermediate for a client", async () => {
    const { reformer, session } = await seed();
    await prisma.session.update({
      where: { id: session.id },
      data: { isIntermediate: true },
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
      sessions: Array<{ id: string; isIntermediate?: boolean }>;
    };
    const row = body.sessions.find((s) => s.id === session.id)!;
    expect(row.isIntermediate).toBe(true);
  });
});
