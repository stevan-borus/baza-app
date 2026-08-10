/**
 * Session "mixed group" — the admin-set binary per-occurrence marking telling
 * clients men and women train together.
 *
 * Write path (PATCH /api/sessions/[id]): admins set true / false; omitting the
 * field leaves it untouched. Read path: the field surfaces on GET
 * /api/sessions/[id] (detail) and GET /api/sessions/availability (client
 * calendar) — the omit-in-one-select bug this mark shares with `isIntermediate`.
 * Also pins that the two marks never disturb each other.
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
    data: { email: "mix-tr@test.local", firstName: "Trainer", lastName: "T", role: "TRAINER" },
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

function patchRequest(sessionId: string, body: unknown) {
  return new Request(`http://test.local/api/sessions/${sessionId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("session mixed-group write path (PATCH)", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("admin marks a session as a mixed group (isMixedGroup=true)", async () => {
    const { session } = await seed();
    asAdmin();

    const res = await PATCH(patchRequest(session.id, { isMixedGroup: true }), {
      id: session.id,
    });
    expect(res.status).toBe(200);
    const reloaded = await prisma.session.findUnique({
      where: { id: session.id },
    });
    expect(reloaded?.isMixedGroup).toBe(true);
    const body = (await res.json()) as { session: { isMixedGroup: boolean } };
    expect(body.session.isMixedGroup).toBe(true);
  });

  it("admin clears the mixed-group marking (isMixedGroup=false)", async () => {
    const { session } = await seed();
    await prisma.session.update({
      where: { id: session.id },
      data: { isMixedGroup: true },
    });
    asAdmin();

    const res = await PATCH(patchRequest(session.id, { isMixedGroup: false }), {
      id: session.id,
    });
    expect(res.status).toBe(200);
    const reloaded = await prisma.session.findUnique({
      where: { id: session.id },
    });
    expect(reloaded?.isMixedGroup).toBe(false);
  });

  it("omitting isMixedGroup leaves an existing marking untouched", async () => {
    const { session } = await seed();
    await prisma.session.update({
      where: { id: session.id },
      data: { isMixedGroup: true },
    });
    asAdmin();

    const res = await PATCH(patchRequest(session.id, { capacity: 5 }), {
      id: session.id,
    });
    expect(res.status).toBe(200);
    const reloaded = await prisma.session.findUnique({
      where: { id: session.id },
    });
    expect(reloaded?.isMixedGroup).toBe(true);
    expect(reloaded?.capacity).toBe(5);
  });

  it("setting mixed-group never disturbs the intermediate marking", async () => {
    // The two marks are orthogonal — this is the regression that a shared
    // update path or a copy-pasted field name would introduce.
    const { session } = await seed();
    await prisma.session.update({
      where: { id: session.id },
      data: { isIntermediate: true },
    });
    asAdmin();

    const res = await PATCH(patchRequest(session.id, { isMixedGroup: true }), {
      id: session.id,
    });
    expect(res.status).toBe(200);
    const reloaded = await prisma.session.findUnique({
      where: { id: session.id },
    });
    expect(reloaded?.isIntermediate).toBe(true);
    expect(reloaded?.isMixedGroup).toBe(true);
  });
});

describe("session mixed-group read path", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("surfaces isMixedGroup on the session detail payload", async () => {
    const { session } = await seed();
    await prisma.session.update({
      where: { id: session.id },
      data: { isMixedGroup: true },
    });
    asAdmin();

    const res = await GET_DETAIL(
      new Request(`http://test.local/api/sessions/${session.id}`),
      { id: session.id },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      session: { isMixedGroup?: boolean };
    };
    expect(body.session.isMixedGroup).toBe(true);
  });

  it("surfaces isMixedGroup on the client availability calendar", async () => {
    // The select-omission trap: the calendar is the surface clients actually
    // read the mark on, and it uses its own select.
    const { session } = await seed();
    await prisma.session.update({
      where: { id: session.id },
      data: { isMixedGroup: true },
    });
    asAdmin();

    const month = now().toISOString().slice(0, 7);
    const res = await GET_AVAILABILITY(
      new Request(
        `http://test.local/api/sessions/availability?month=${month}`,
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      sessions: { id: string; isMixedGroup?: boolean }[];
    };
    const found = body.sessions.find((s) => s.id === session.id);
    expect(found).toBeDefined();
    expect(found?.isMixedGroup).toBe(true);
  });
});
