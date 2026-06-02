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

const createSystemNotificationMock =
  vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);
vi.mock("@/lib/server/notifications", () => ({
  createSystemNotification: (...args: unknown[]) =>
    createSystemNotificationMock(...args),
}));

import { GET, POST } from "@/app/api/trainer-notes/+api";
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
  const client = await prisma.user.create({
    data: { email: "client@test.local", firstName: "Client", lastName: "Test", role: "CLIENT" },
  });
  const clientProfile = await prisma.clientProfile.create({
    data: { userId: client.id },
  });
  const reformer = await prisma.classType.create({
    data: { name: "Reformer", maxClients: 6, durationMins: 60 },
  });
  return { trainer, otherTrainer, client, clientProfile, reformer };
}

async function makeSession(trainerUserId: string, classTypeId: string) {
  const startsAt = new Date(nowMs() + DAY_MS);
  return prisma.session.create({
    data: {
      classTypeId,
      trainerUserId,
      startsAt,
      endsAt: new Date(startsAt.getTime() + HOUR_MS),
      capacity: 6,
      isActive: true,
      status: "SCHEDULED",
    },
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

function asClient(c: { id: string; email: string; profileId: string }) {
  setMockUser({
    id: c.id,
    role: "CLIENT",
    email: c.email,
    isActive: true,
    clientProfile: { id: c.profileId },
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

function postBody(body: unknown) {
  return new Request("http://test.local/api/trainer-notes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("trainer-notes", () => {
  beforeEach(async () => {
    await resetDb();
    createSystemNotificationMock.mockClear();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("POST creates a note when the trainer owns the session AND the client is actively booked", async () => {
    const { trainer, clientProfile, reformer } = await seed();
    const session = await makeSession(trainer.id, reformer.id);
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: clientProfile.id },
    });
    asTrainer(trainer);

    const response = await POST(
      postBody({
        sessionId: session.id,
        clientProfileId: clientProfile.id,
        note: "Great form on the long-spine series.",
      }),
    );
    expect(response.status).toBe(201);
    const persisted = await prisma.trainerNote.findFirst({
      where: { sessionId: session.id, clientProfileId: clientProfile.id },
    });
    expect(persisted?.trainerUserId).toBe(trainer.id);
  });

  it("POST creates a session-less note when the trainer is linked to the client via any non-canceled booking", async () => {
    const { trainer, clientProfile, reformer } = await seed();
    // Establish the trainer-client link via a booking on some session the
    // trainer owns — the note itself attaches no session, but the IDOR
    // guard requires *some* training relationship to exist.
    const linkingSession = await makeSession(trainer.id, reformer.id);
    await prisma.booking.create({
      data: { sessionId: linkingSession.id, clientProfileId: clientProfile.id },
    });
    asTrainer(trainer);

    const response = await POST(
      postBody({
        clientProfileId: clientProfile.id,
        note: "Recurring lower-back complaint — keep an eye on roll-ups.",
      }),
    );
    expect(response.status).toBe(201);
    const persisted = await prisma.trainerNote.findFirst({
      where: { clientProfileId: clientProfile.id, sessionId: null },
    });
    expect(persisted?.trainerUserId).toBe(trainer.id);
  });

  it("POST is rejected with 403 when the trainer has no booking link to the client (session-less)", async () => {
    const { trainer, clientProfile } = await seed();
    // No bookings, no sessions for this trainer — they should NOT be able
    // to write a note against an arbitrary client. Guards against IDOR.
    asTrainer(trainer);

    const response = await POST(
      postBody({
        clientProfileId: clientProfile.id,
        note: "IDOR attempt",
      }),
    );
    expect(response.status).toBe(403);
    expect(await prisma.trainerNote.count()).toBe(0);
  });

  it("POST as ADMIN can write a session-less note for any client (no trainer-link check)", async () => {
    const { clientProfile } = await seed();
    const admin = await prisma.user.create({
      data: { email: "admin@test.local", firstName: "Admin", lastName: "Test", role: "ADMIN" },
    });
    setMockUser({
      id: admin.id,
      role: "ADMIN",
      email: admin.email,
      isActive: true,
      clientProfile: null,
    });

    const response = await POST(
      postBody({
        clientProfileId: clientProfile.id,
        note: "Admin general note.",
      }),
    );
    expect(response.status).toBe(201);
  });

  it("POST is rejected with 403 when the trainer does not own the session", async () => {
    const { trainer, otherTrainer, clientProfile, reformer } = await seed();
    const session = await makeSession(otherTrainer.id, reformer.id);
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: clientProfile.id },
    });
    asTrainer(trainer);

    const response = await POST(
      postBody({
        sessionId: session.id,
        clientProfileId: clientProfile.id,
        note: "n",
      }),
    );
    expect(response.status).toBe(403);
    expect(await prisma.trainerNote.count()).toBe(0);
  });

  it("POST returns 409 when the client has no active booking on the session", async () => {
    const { trainer, clientProfile, reformer } = await seed();
    const session = await makeSession(trainer.id, reformer.id);
    // Trainer-link satisfied via a separate booking — isolates the
    // per-session active-booking check from the broader IDOR guard.
    const linkingSession = await makeSession(trainer.id, reformer.id);
    await prisma.booking.create({
      data: { sessionId: linkingSession.id, clientProfileId: clientProfile.id },
    });
    asTrainer(trainer);

    const response = await POST(
      postBody({
        sessionId: session.id,
        clientProfileId: clientProfile.id,
        note: "n",
      }),
    );
    expect(response.status).toBe(409);
    expect(await prisma.trainerNote.count()).toBe(0);
  });

  it("POST returns 409 when the client's only booking on the session is canceled", async () => {
    const { trainer, clientProfile, reformer } = await seed();
    const session = await makeSession(trainer.id, reformer.id);
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: clientProfile.id,
        canceledAt: now(),
      },
    });
    // Trainer-link satisfied via a separate (active) booking.
    const linkingSession = await makeSession(trainer.id, reformer.id);
    await prisma.booking.create({
      data: { sessionId: linkingSession.id, clientProfileId: clientProfile.id },
    });
    asTrainer(trainer);

    const response = await POST(
      postBody({
        sessionId: session.id,
        clientProfileId: clientProfile.id,
        note: "n",
      }),
    );
    expect(response.status).toBe(409);
  });

  it("GET as trainer returns only the trainer's own notes", async () => {
    const { trainer, otherTrainer, clientProfile, reformer } = await seed();
    const sessionA = await makeSession(trainer.id, reformer.id);
    const sessionB = await makeSession(otherTrainer.id, reformer.id);
    await prisma.trainerNote.create({
      data: {
        sessionId: sessionA.id,
        clientProfileId: clientProfile.id,
        trainerUserId: trainer.id,
        note: "mine",
      },
    });
    await prisma.trainerNote.create({
      data: {
        sessionId: sessionB.id,
        clientProfileId: clientProfile.id,
        trainerUserId: otherTrainer.id,
        note: "theirs",
      },
    });

    asTrainer(trainer);
    const response = await GET(
      new Request("http://test.local/api/trainer-notes?take=10"),
    );
    const body = (await response.json()) as { notes: { note: string }[] };
    expect(body.notes.map((n) => n.note)).toEqual(["mine"]);
  });

  it("GET as client is forbidden — clients never see TrainerNotes", async () => {
    // TrainerNotes are internal observations a trainer writes for their own
    // and the studio's reference. The audience is the authoring Trainer
    // and all Admins; clients are not in the audience. Even a client
    // querying for "their own" notes gets 403 — the endpoint is not
    // exposed to the CLIENT role at all.
    const { trainer, client, clientProfile, reformer } = await seed();
    const session = await makeSession(trainer.id, reformer.id);
    await prisma.trainerNote.create({
      data: {
        sessionId: session.id,
        clientProfileId: clientProfile.id,
        trainerUserId: trainer.id,
        note: "for me",
      },
    });

    asClient({ id: client.id, email: client.email, profileId: clientProfile.id });
    const response = await GET(
      new Request("http://test.local/api/trainer-notes?take=10"),
    );
    expect(response.status).toBe(403);
  });

  it("POST does not create a client-targeted notification (clients never see TrainerNotes, so pinging them is user-hostile)", async () => {
    const { trainer, clientProfile, reformer } = await seed();
    const session = await makeSession(trainer.id, reformer.id);
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: clientProfile.id },
    });
    asTrainer(trainer);

    const response = await POST(
      postBody({
        sessionId: session.id,
        clientProfileId: clientProfile.id,
        note: "Stop notifying clients about notes they can't read.",
      }),
    );
    expect(response.status).toBe(201);
    expect(createSystemNotificationMock).not.toHaveBeenCalled();
  });

  it("GET as admin returns notes from every trainer", async () => {
    const { trainer, otherTrainer, clientProfile, reformer } = await seed();
    const sessionA = await makeSession(trainer.id, reformer.id);
    const sessionB = await makeSession(otherTrainer.id, reformer.id);
    await prisma.trainerNote.create({
      data: {
        sessionId: sessionA.id,
        clientProfileId: clientProfile.id,
        trainerUserId: trainer.id,
        note: "a",
      },
    });
    await prisma.trainerNote.create({
      data: {
        sessionId: sessionB.id,
        clientProfileId: clientProfile.id,
        trainerUserId: otherTrainer.id,
        note: "b",
      },
    });

    asAdmin();
    const response = await GET(
      new Request("http://test.local/api/trainer-notes?take=10"),
    );
    const body = (await response.json()) as { notes: { note: string }[] };
    expect(body.notes.map((n) => n.note).sort()).toEqual(["a", "b"]);
  });
});
