import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

vi.mock("@/lib/server/notifications", async () => (await import("./notifications-mock")).notificationsMock());

import { POST } from "@/server/routes/bookings";
import { prisma } from "@/lib/server/prisma";
import { nowMs } from "@/lib/now";

async function seed() {
  const trainer = await prisma.user.create({
    data: { email: "trainer@test.local", firstName: "Trainer", lastName: "User", role: "TRAINER" },
  });
  const client = await prisma.user.create({
    data: { email: "client@test.local", firstName: "Client", lastName: "User", role: "CLIENT" },
  });
  const clientProfile = await prisma.clientProfile.create({
    data: { userId: client.id, dateOfBirth: new Date("1990-01-01") },
  });
  const reformer = await prisma.classType.create({
    data: { name: "Reformer pilates", maxClients: 6, durationMins: 60 },
  });
  return { trainer, client, clientProfile, reformer };
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
      isActive: true,
      status: "SCHEDULED",
    },
  });
}

async function createPackage(opts: {
  clientProfileId: string;
  classTypeId: string;
  sessionsRemaining: number;
}) {
  const packageType = await prisma.packageType.create({
    data: {
      name: `pt-${Math.random()}`,
      sessionCount: 12,
      validityDays: 30,
      lateCancelHours: 12,
      classTypes: { create: { classTypeId: opts.classTypeId } },
    },
  });
  return prisma.clientPackage.create({
    data: {
      clientProfileId: opts.clientProfileId,
      packageTypeId: packageType.id,
      classTypes: { create: { classTypeId: opts.classTypeId } },
      lateCancelHours: 12,
      startsAt: new Date(nowMs() - 24 * 60 * 60 * 1000),
      expiresAt: new Date(nowMs() + 60 * 24 * 60 * 60 * 1000),
      sessionsRemaining: opts.sessionsRemaining,
    },
  });
}

function bookReq(sessionId: string) {
  return new Request("http://test.local/api/bookings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, action: "BOOK" }),
  });
}

function asClient(client: { id: string; email: string }, profileId: string) {
  setMockUser({
    id: client.id,
    role: "CLIENT",
    email: client.email,
    isActive: true,
    clientProfile: { id: profileId },
  });
}

describe("POST /api/bookings package overuse", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("allows booking up to remaining, rejects the one past it", async () => {
    const { client, clientProfile, trainer, reformer } = await seed();
    await createPackage({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      sessionsRemaining: 2,
    });
    asClient(client, clientProfile.id);

    const day = 24 * 60 * 60 * 1000;
    const s1 = await createSession({ classTypeId: reformer.id, trainerUserId: trainer.id, startsAt: new Date(nowMs() + 1 * day) });
    const s2 = await createSession({ classTypeId: reformer.id, trainerUserId: trainer.id, startsAt: new Date(nowMs() + 2 * day) });
    const s3 = await createSession({ classTypeId: reformer.id, trainerUserId: trainer.id, startsAt: new Date(nowMs() + 3 * day) });

    expect((await POST(bookReq(s1.id))).status).toBe(200);
    expect((await POST(bookReq(s2.id))).status).toBe(200);

    const res3 = await POST(bookReq(s3.id));
    expect(res3.status).toBe(409);
    expect((await res3.json()).error).toBe("PACKAGE_EXHAUSTED");

    const booked = await prisma.booking.count({
      where: { clientProfileId: clientProfile.id, canceledAt: null },
    });
    expect(booked).toBe(2);
  });

  it("counts a waitlist entry as a held session", async () => {
    const { client, clientProfile, trainer, reformer } = await seed();
    await createPackage({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      sessionsRemaining: 1,
    });
    asClient(client, clientProfile.id);

    const day = 24 * 60 * 60 * 1000;
    // A full session so this client lands on the waitlist (capacity 1, taken by another booking).
    const full = await createSession({ classTypeId: reformer.id, trainerUserId: trainer.id, startsAt: new Date(nowMs() + 1 * day), capacity: 1 });
    const other = await prisma.clientProfile.create({
      data: { userId: (await prisma.user.create({ data: { email: "o@test.local", firstName: "O", lastName: "P", role: "CLIENT" } })).id, dateOfBirth: new Date("1990-01-01") },
    });
    await prisma.booking.create({ data: { sessionId: full.id, clientProfileId: other.id } });

    // Client joins the waitlist for the full session — this reserves their 1 session.
    const wlRes = await POST(bookReq(full.id));
    expect(wlRes.status).toBe(200);
    expect((await wlRes.json()).state).toBe("WAITLISTED");

    // Now a normal open session — should be rejected, the lone session is held by the waitlist seat.
    const open = await createSession({ classTypeId: reformer.id, trainerUserId: trainer.id, startsAt: new Date(nowMs() + 2 * day) });
    const res = await POST(bookReq(open.id));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("PACKAGE_EXHAUSTED");
  });

  it("does not count canceled or past bookings toward the limit", async () => {
    const { client, clientProfile, trainer, reformer } = await seed();
    const pkg = await createPackage({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      sessionsRemaining: 1,
    });
    asClient(client, clientProfile.id);

    const day = 24 * 60 * 60 * 1000;
    // A canceled future booking against the package — must NOT count.
    const canceledSession = await createSession({ classTypeId: reformer.id, trainerUserId: trainer.id, startsAt: new Date(nowMs() + 1 * day) });
    await prisma.booking.create({
      data: { sessionId: canceledSession.id, clientProfileId: clientProfile.id, clientPackageId: pkg.id, canceledAt: new Date(nowMs()) },
    });

    const open = await createSession({ classTypeId: reformer.id, trainerUserId: trainer.id, startsAt: new Date(nowMs() + 2 * day) });
    const res = await POST(bookReq(open.id));
    expect(res.status).toBe(200);
    expect((await res.json()).state).toBe("BOOKED");
  });
});
