import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

vi.mock("@/lib/server/notifications", async () => (await import("./notifications-mock")).notificationsMock());

import { POST } from "@/server/routes/sessions";
import { PATCH } from "@/server/routes/sessions/[id]";
import { prisma } from "@/lib/server/prisma";
import { now, nowMs } from "@/lib/now";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

async function seed() {
  const trainer = await prisma.user.create({
    data: { email: "trainer@test.local", firstName: "Trainer", lastName: "Test", role: "TRAINER" },
  });
  const otherTrainer = await prisma.user.create({
    data: { email: "other@test.local", firstName: "Other", lastName: "Test", role: "TRAINER" },
  });
  const reformer = await prisma.classType.create({
    data: { name: "Reformer", maxClients: 6, durationMins: 60 },
  });
  return { trainer, otherTrainer, reformer };
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

function jsonRequest(url: string, method: string, body: unknown) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const futureStart = new Date(nowMs() + 2 * DAY_MS);
const futureEnd = new Date(futureStart.getTime() + HOUR_MS);

describe("sessions CRUD", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("POST as admin creates a session assigned to a chosen trainer", async () => {
    const { trainer, reformer } = await seed();
    asAdmin();

    const response = await POST(
      jsonRequest("http://test.local/api/sessions", "POST", {
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt: futureStart.toISOString(),
        endsAt: futureEnd.toISOString(),
        capacity: 6,
      }),
    );
    expect(response.status).toBe(201);
    const persisted = await prisma.session.findFirst({
      where: { trainerUserId: trainer.id },
    });
    expect(persisted).not.toBeNull();
  });

  it("POST response body includes the full list-row shape (classType + room)", async () => {
    const { trainer, reformer } = await seed();
    asAdmin();

    const response = await POST(
      jsonRequest("http://test.local/api/sessions", "POST", {
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt: futureStart.toISOString(),
        endsAt: futureEnd.toISOString(),
        capacity: 6,
      }),
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      session: {
        classTypeId: string;
        classType: { id: string; name: string };
        roomId: string | null;
        room: { id: string; name: string } | null;
        trainerUserId: string | null;
      };
    };
    expect(body.session.classTypeId).toBe(reformer.id);
    expect(body.session.classType).toEqual({ id: reformer.id, name: "Reformer" });
    // No room was assigned, so roomId is null and the room relation is null.
    expect(body.session.roomId).toBeNull();
    expect(body.session.room).toBeNull();
    // trainerUserId must be present in the response — the client parses it with
    // a `z.nullable(z.string())` schema, so omitting it (undefined) throws a raw
    // ZodError that leaks to the UI even though the session was created.
    expect(body.session.trainerUserId).toBe(trainer.id);
  });

  it("POST as trainer assigns the session to themselves regardless of payload trainerUserId", async () => {
    const { trainer, reformer } = await seed();
    asTrainer(trainer);

    const response = await POST(
      jsonRequest("http://test.local/api/sessions", "POST", {
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt: futureStart.toISOString(),
        endsAt: futureEnd.toISOString(),
        capacity: 6,
      }),
    );
    expect(response.status).toBe(201);
    const persisted = await prisma.session.findFirst({
      where: { trainerUserId: trainer.id },
    });
    expect(persisted).not.toBeNull();
  });

  it("POST as trainer trying to assign to a different trainer is rejected (403)", async () => {
    const { trainer, otherTrainer, reformer } = await seed();
    asTrainer(trainer);

    const response = await POST(
      jsonRequest("http://test.local/api/sessions", "POST", {
        classTypeId: reformer.id,
        trainerUserId: otherTrainer.id,
        startsAt: futureStart.toISOString(),
        endsAt: futureEnd.toISOString(),
        capacity: 6,
      }),
    );
    expect(response.status).toBe(403);
    expect(await prisma.session.count()).toBe(0);
  });

  it("POST returns 400 when endsAt is not after startsAt", async () => {
    const { trainer, reformer } = await seed();
    asAdmin();

    const response = await POST(
      jsonRequest("http://test.local/api/sessions", "POST", {
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt: futureStart.toISOString(),
        endsAt: futureStart.toISOString(),
        capacity: 6,
      }),
    );
    expect(response.status).toBe(400);
  });

  it("PATCH as admin updates startsAt and endsAt on an existing session", async () => {
    const { trainer, reformer } = await seed();
    const session = await prisma.session.create({
      data: {
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt: futureStart,
        endsAt: futureEnd,
        capacity: 6,
        status: "SCHEDULED",
        isActive: true,
      },
    });
    const newStart = new Date(futureStart.getTime() + 3 * HOUR_MS);
    const newEnd = new Date(newStart.getTime() + HOUR_MS);
    asAdmin();

    const response = await PATCH(
      jsonRequest(`http://test.local/api/sessions/${session.id}`, "PATCH", {
        startsAt: newStart.toISOString(),
        endsAt: newEnd.toISOString(),
      }),
      { id: session.id },
    );
    expect(response.status).toBe(200);
    const reloaded = await prisma.session.findUnique({ where: { id: session.id } });
    expect(reloaded?.startsAt.getTime()).toBe(newStart.getTime());
  });

  it("PATCH response body includes the full list-row shape (classType + room)", async () => {
    const { trainer, reformer } = await seed();
    const session = await prisma.session.create({
      data: {
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt: futureStart,
        endsAt: futureEnd,
        capacity: 6,
        status: "SCHEDULED",
        isActive: true,
      },
    });
    asAdmin();

    const response = await PATCH(
      jsonRequest(`http://test.local/api/sessions/${session.id}`, "PATCH", {
        capacity: 8,
      }),
      { id: session.id },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      session: {
        classTypeId: string;
        classType: { id: string; name: string };
        roomId: string | null;
        room: { id: string; name: string } | null;
      };
    };
    expect(body.session.classTypeId).toBe(reformer.id);
    expect(body.session.classType).toEqual({ id: reformer.id, name: "Reformer" });
    expect(body.session.roomId).toBeNull();
    expect(body.session.room).toBeNull();
  });

  it("PATCH as trainer for a session they do not own is rejected (403)", async () => {
    const { trainer, otherTrainer, reformer } = await seed();
    const session = await prisma.session.create({
      data: {
        classTypeId: reformer.id,
        trainerUserId: otherTrainer.id,
        startsAt: futureStart,
        endsAt: futureEnd,
        capacity: 6,
        status: "SCHEDULED",
        isActive: true,
      },
    });
    asTrainer(trainer);

    const response = await PATCH(
      jsonRequest(`http://test.local/api/sessions/${session.id}`, "PATCH", {
        capacity: 12,
      }),
      { id: session.id },
    );
    expect(response.status).toBe(403);
  });

  it("PATCH as trainer editing a session they DO own is rejected (403)", async () => {
    // Trainers are read-only on sessions — only admins may edit/cancel/hide.
    const { trainer, reformer } = await seed();
    const session = await prisma.session.create({
      data: {
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt: futureStart,
        endsAt: futureEnd,
        capacity: 6,
        status: "SCHEDULED",
        isActive: true,
      },
    });
    asTrainer(trainer);

    const response = await PATCH(
      jsonRequest(`http://test.local/api/sessions/${session.id}`, "PATCH", {
        capacity: 12,
      }),
      { id: session.id },
    );
    expect(response.status).toBe(403);

    // And nothing changed in the DB.
    const after = await prisma.session.findUnique({ where: { id: session.id } });
    expect(after?.capacity).toBe(6);
  });

  it("PATCH as trainer attempting to reassign their session to another trainer is rejected (403)", async () => {
    const { trainer, otherTrainer, reformer } = await seed();
    const session = await prisma.session.create({
      data: {
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt: futureStart,
        endsAt: futureEnd,
        capacity: 6,
        status: "SCHEDULED",
        isActive: true,
      },
    });
    asTrainer(trainer);

    const response = await PATCH(
      jsonRequest(`http://test.local/api/sessions/${session.id}`, "PATCH", {
        trainerUserId: otherTrainer.id,
      }),
      { id: session.id },
    );
    expect(response.status).toBe(403);
  });

  it("PATCH refuses to hide (isActive=false) a future session that has active bookings (409)", async () => {
    const { trainer, reformer } = await seed();
    const client = await prisma.user.create({
      data: { email: "c@test.local", firstName: "C", lastName: "Test", role: "CLIENT" },
    });
    const profile = await prisma.clientProfile.create({
      data: { userId: client.id },
    });
    const session = await prisma.session.create({
      data: {
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt: futureStart,
        endsAt: futureEnd,
        capacity: 6,
        status: "SCHEDULED",
        isActive: true,
      },
    });
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: profile.id },
    });
    asAdmin();

    const response = await PATCH(
      jsonRequest(`http://test.local/api/sessions/${session.id}`, "PATCH", {
        isActive: false,
      }),
      { id: session.id },
    );
    expect(response.status).toBe(409);
    const reloaded = await prisma.session.findUnique({ where: { id: session.id } });
    expect(reloaded?.isActive).toBe(true);
  });

  it("PATCH returns 404 for an unknown session id", async () => {
    asAdmin();
    const response = await PATCH(
      jsonRequest("http://test.local/api/sessions/x", "PATCH", { capacity: 8 }),
      { id: "00000000-0000-0000-0000-000000000000" },
    );
    expect(response.status).toBe(404);
  });
});

describe("sessions emptyBookingCutoffHours (per-occurrence config)", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  async function postSession(
    trainerUserId: string,
    classTypeId: string,
    body: Record<string, unknown>,
  ) {
    return POST(
      jsonRequest("http://test.local/api/sessions", "POST", {
        classTypeId,
        trainerUserId,
        startsAt: futureStart.toISOString(),
        endsAt: futureEnd.toISOString(),
        capacity: 6,
        ...body,
      }),
    );
  }

  it("POST with an explicit cutoff persists and returns it", async () => {
    const { trainer, reformer } = await seed();
    asAdmin();

    const response = await postSession(trainer.id, reformer.id, {
      emptyBookingCutoffHours: 8,
    });

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.session.emptyBookingCutoffHours).toBe(8);
    const reloaded = await prisma.session.findUnique({
      where: { id: json.session.id },
    });
    expect(reloaded?.emptyBookingCutoffHours).toBe(8);
  });

  it("POST without the field falls back to the 4h default", async () => {
    const { trainer, reformer } = await seed();
    asAdmin();

    const response = await postSession(trainer.id, reformer.id, {});

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.session.emptyBookingCutoffHours).toBe(4);
    const reloaded = await prisma.session.findUnique({
      where: { id: json.session.id },
    });
    expect(reloaded?.emptyBookingCutoffHours).toBe(4);
  });

  it("PATCH sets the cutoff to 0 (rule off) without touching the other fields", async () => {
    const { trainer, reformer } = await seed();
    const session = await prisma.session.create({
      data: {
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt: futureStart,
        endsAt: futureEnd,
        capacity: 6,
        emptyBookingCutoffHours: 4,
      },
    });
    asAdmin();

    const response = await PATCH(
      jsonRequest(
        `http://test.local/api/sessions/${session.id}`,
        "PATCH",
        { emptyBookingCutoffHours: 0 },
      ),
      { id: session.id },
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.session.emptyBookingCutoffHours).toBe(0);
    const reloaded = await prisma.session.findUnique({
      where: { id: session.id },
    });
    expect(reloaded?.emptyBookingCutoffHours).toBe(0);
    expect(reloaded?.capacity).toBe(6);
    expect(reloaded?.trainerUserId).toBe(trainer.id);
  });

  // Regression guard: an updateSessionInputSchema built with .partial() off a
  // defaulted create schema would parse an omitted field back to 4 and silently
  // wipe a configured value.
  it("PATCH that omits the cutoff leaves the stored value alone (no default reset)", async () => {
    const { trainer, reformer } = await seed();
    const session = await prisma.session.create({
      data: {
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAt: futureStart,
        endsAt: futureEnd,
        capacity: 6,
        emptyBookingCutoffHours: 9,
      },
    });
    asAdmin();

    const response = await PATCH(
      jsonRequest(
        `http://test.local/api/sessions/${session.id}`,
        "PATCH",
        { capacity: 10 },
      ),
      { id: session.id },
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.session.emptyBookingCutoffHours).toBe(9);
    const reloaded = await prisma.session.findUnique({
      where: { id: session.id },
    });
    expect(reloaded?.emptyBookingCutoffHours).toBe(9);
    expect(reloaded?.capacity).toBe(10);
  });
});
