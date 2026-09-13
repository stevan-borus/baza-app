import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

vi.mock("@/lib/server/notifications", async () => (await import("./notifications-mock")).notificationsMock());

import { POST } from "@/server/routes/admin/reservations";
import { prisma } from "@/lib/server/prisma";
import { nowMs } from "@/lib/now";

async function seedBasics() {
  const admin = await prisma.user.create({
    data: { email: "admin@test.local", firstName: "Admin", lastName: "User", role: "ADMIN" },
  });
  const trainer = await prisma.user.create({
    data: { email: "trainer@test.local", firstName: "Trainer", lastName: "User", role: "TRAINER" },
  });
  const clientUser = await prisma.user.create({
    data: { email: "client@test.local", firstName: "Marija", lastName: "Klijent", role: "CLIENT" },
  });
  const clientProfile = await prisma.clientProfile.create({
    data: { userId: clientUser.id },
  });
  const reformer = await prisma.classType.create({
    data: { name: "Reformer", maxClients: 6, durationMins: 60 },
  });
  return { admin, trainer, clientUser, clientProfile, reformer };
}

async function createSession(opts: {
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
      endsAt: new Date(opts.startsAt.getTime() + 60 * 60 * 1000),
      capacity: opts.capacity ?? 6,
    },
  });
}

function buildRequest(body: unknown) {
  return new Request("http://test.local/api/admin/reservations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function asAdmin(admin: { id: string; email: string }) {
  setMockUser({
    id: admin.id,
    role: "ADMIN",
    email: admin.email,
    isActive: true,
    clientProfile: null,
  });
}

describe("POST /api/admin/reservations", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("creates an unbacked Booking for a session even when client has no package", async () => {
    const { admin, trainer, clientProfile, reformer } = await seedBasics();
    const session = await createSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 24 * 60 * 60 * 1000),
    });
    asAdmin(admin);

    const res = await POST(
      buildRequest({
        clientProfileId: clientProfile.id,
        sessionIds: [session.id],
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reserved).toBe(1);
    expect(body.skippedFull).toEqual([]);
    expect(body.skippedAlreadyBooked).toEqual([]);

    const booking = await prisma.booking.findFirst({
      where: { sessionId: session.id, clientProfileId: clientProfile.id },
    });
    expect(booking).not.toBeNull();
    expect(booking?.clientPackageId).toBeNull();
    expect(booking?.createdByUserId).toBe(admin.id);
    expect(booking?.canceledAt).toBeNull();
  });

  it("skips full sessions and reports them in skippedFull", async () => {
    const { admin, trainer, clientProfile, reformer } = await seedBasics();
    // Capacity 1, already filled.
    const fullSession = await createSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 24 * 60 * 60 * 1000),
      capacity: 1,
    });
    const otherClient = await prisma.user.create({
      data: { email: "other@test.local", firstName: "Other", lastName: "Client", role: "CLIENT" },
    });
    const otherProfile = await prisma.clientProfile.create({
      data: { userId: otherClient.id },
    });
    await prisma.booking.create({
      data: { sessionId: fullSession.id, clientProfileId: otherProfile.id },
    });
    const openSession = await createSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 48 * 60 * 60 * 1000),
    });
    asAdmin(admin);

    const res = await POST(
      buildRequest({
        clientProfileId: clientProfile.id,
        sessionIds: [fullSession.id, openSession.id],
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reserved).toBe(1);
    expect(body.skippedFull).toEqual([fullSession.id]);

    const bookingForFull = await prisma.booking.findFirst({
      where: { sessionId: fullSession.id, clientProfileId: clientProfile.id },
    });
    expect(bookingForFull).toBeNull();
    const bookingForOpen = await prisma.booking.findFirst({
      where: { sessionId: openSession.id, clientProfileId: clientProfile.id },
    });
    expect(bookingForOpen).not.toBeNull();
  });

  it("skips sessions the client is already booked on", async () => {
    const { admin, trainer, clientProfile, reformer } = await seedBasics();
    const session = await createSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 24 * 60 * 60 * 1000),
    });
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: clientProfile.id },
    });
    asAdmin(admin);

    const res = await POST(
      buildRequest({
        clientProfileId: clientProfile.id,
        sessionIds: [session.id],
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reserved).toBe(0);
    expect(body.skippedAlreadyBooked).toEqual([session.id]);
  });

  // ── Re-reserving after a cancel ───────────────────────────────────────────
  // The studio owner's report: reserve some sessions, cancel one (from either
  // the admin bulk-cancel or the client's own cancel), then the reserve button
  // does nothing for that client. `@@unique([sessionId, clientProfileId])`
  // means the cancelled row still occupies the pair, so a bare `create` throws
  // P2002 → 500 → the confirm sheet has no onError and just sits there.
  it("re-reserves a session the client previously cancelled", async () => {
    const { admin, trainer, clientProfile, reformer } = await seedBasics();
    const session = await createSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 24 * 60 * 60 * 1000),
    });
    // A cancelled booking on the same (session, client) pair — exactly what
    // both cancel paths leave behind (they stamp canceledAt, never delete).
    const canceled = await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: clientProfile.id,
        canceledAt: new Date(nowMs() - 60 * 60 * 1000),
      },
    });
    asAdmin(admin);

    const res = await POST(
      buildRequest({
        clientProfileId: clientProfile.id,
        sessionIds: [session.id],
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reserved).toBe(1);
    expect(body.reservedSessionIds).toEqual([session.id]);
    expect(body.skippedAlreadyBooked).toEqual([]);

    // The revived row is the same row — the unique pair permits only one.
    const bookings = await prisma.booking.findMany({
      where: { sessionId: session.id, clientProfileId: clientProfile.id },
    });
    expect(bookings).toHaveLength(1);
    expect(bookings[0]!.id).toBe(canceled.id);
    expect(bookings[0]!.canceledAt).toBeNull();
    expect(bookings[0]!.createdByUserId).toBe(admin.id);
  });

  // A cancelled row must not eat a seat: capacity counts only active bookings,
  // and the revive has to respect that count at the moment it runs.
  it("reports a full session as skippedFull even when the client's own cancelled row exists", async () => {
    const { admin, trainer, clientProfile, reformer } = await seedBasics();
    const session = await createSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 24 * 60 * 60 * 1000),
      capacity: 1,
    });
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: clientProfile.id,
        canceledAt: new Date(nowMs() - 60 * 60 * 1000),
      },
    });
    // Someone else took the freed seat.
    const otherClient = await prisma.user.create({
      data: { email: "taker@test.local", firstName: "Seat", lastName: "Taker", role: "CLIENT" },
    });
    const otherProfile = await prisma.clientProfile.create({
      data: { userId: otherClient.id },
    });
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: otherProfile.id },
    });
    asAdmin(admin);

    const res = await POST(
      buildRequest({
        clientProfileId: clientProfile.id,
        sessionIds: [session.id],
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reserved).toBe(0);
    expect(body.skippedFull).toEqual([session.id]);

    const mine = await prisma.booking.findFirst({
      where: { sessionId: session.id, clientProfileId: clientProfile.id },
    });
    expect(mine?.canceledAt).not.toBeNull();
  });

  it("forbids non-admin callers (403)", async () => {
    const { trainer, clientProfile, reformer } = await seedBasics();
    const session = await createSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 24 * 60 * 60 * 1000),
    });
    setMockUser({
      id: trainer.id,
      role: "TRAINER",
      email: trainer.email,
      isActive: true,
      clientProfile: null,
    });

    const res = await POST(
      buildRequest({
        clientProfileId: clientProfile.id,
        sessionIds: [session.id],
      }),
    );
    expect(res.status).toBe(403);
  });

  it("rejects empty sessionIds with 400", async () => {
    const { admin, clientProfile } = await seedBasics();
    asAdmin(admin);

    const res = await POST(
      buildRequest({
        clientProfileId: clientProfile.id,
        sessionIds: [],
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a non-string clientProfileId with 400 and Zod details", async () => {
    const { admin } = await seedBasics();
    asAdmin(admin);

    const res = await POST(
      buildRequest({
        clientProfileId: 123,
        sessionIds: ["some-session-id"],
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; details?: unknown };
    expect(body.details).toBeDefined();
  });
});
