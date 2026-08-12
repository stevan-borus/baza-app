import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

vi.mock("@/lib/server/notifications", async () => (await import("./notifications-mock")).notificationsMock());

import { POST } from "@/server/routes/bookings";
import { prisma } from "@/lib/server/prisma";
import { now, nowMs } from "@/lib/now";

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
  const energy = await prisma.classType.create({
    data: { name: "Energy pilates", maxClients: 12, durationMins: 60 },
  });
  return { trainer, client, clientProfile, reformer, energy };
}

async function createSession(opts: {
  classTypeId: string;
  trainerUserId: string;
  startsAt: Date;
  capacity?: number;
}) {
  const session = await prisma.session.create({
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
  return session;
}

async function createPackage(opts: {
  clientProfileId: string;
  classTypeIds: string[];
  sessionsRemaining?: number;
  startsAt?: Date;
  expiresAt?: Date;
}) {
  const packageType = await prisma.packageType.create({
    data: {
      name: `pt-${Math.random()}`,
      sessionCount: 12,
      validityDays: 30,
      lateCancelHours: 12,
      classTypes: {
        create: opts.classTypeIds.map((classTypeId) => ({ classTypeId })),
      },
    },
  });
  return prisma.clientPackage.create({
    data: {
      clientProfileId: opts.clientProfileId,
      packageTypeId: packageType.id,
      classTypes: {
        create: opts.classTypeIds.map((classTypeId) => ({ classTypeId })),
      },
      lateCancelHours: 12,
      startsAt: opts.startsAt ?? new Date(nowMs() - 24 * 60 * 60 * 1000),
      expiresAt:
        opts.expiresAt ?? new Date(nowMs() + 60 * 24 * 60 * 60 * 1000),
      sessionsRemaining: opts.sessionsRemaining ?? 12,
      sessionsGranted: opts.sessionsRemaining ?? 12,
    },
  });
}

function buildJsonRequest(body: unknown) {
  return new Request("http://test.local/api/bookings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/bookings class-scoping", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("returns 409 with no_package_for_class when client has only an other-class pack", async () => {
    const { client, clientProfile, trainer, reformer, energy } = await seed();
    await createPackage({
      clientProfileId: clientProfile.id,
      classTypeIds: [energy.id],
    });
    const session = await createSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 24 * 60 * 60 * 1000),
    });

    setMockUser({
      id: client.id,
      role: "CLIENT",
      email: client.email,
      isActive: true,
      clientProfile: { id: clientProfile.id },
    });

    const res = await POST(
      buildJsonRequest({ sessionId: session.id, action: "BOOK" }),
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("no_package_for_class");
  });

  it("books successfully when client owns a pack for the session's class", async () => {
    const { client, clientProfile, trainer, reformer } = await seed();
    const pkg = await createPackage({
      clientProfileId: clientProfile.id,
      classTypeIds: [reformer.id],
    });
    const session = await createSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 24 * 60 * 60 * 1000),
    });

    setMockUser({
      id: client.id,
      role: "CLIENT",
      email: client.email,
      isActive: true,
      clientProfile: { id: clientProfile.id },
    });

    const res = await POST(
      buildJsonRequest({ sessionId: session.id, action: "BOOK" }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.state).toBe("BOOKED");
    const booking = await prisma.booking.findFirst({
      where: { sessionId: session.id, clientProfileId: clientProfile.id },
    });
    expect(booking?.clientPackageId).toBe(pkg.id);
  });

  it("mix package books BOTH covered types against one shared pool — holds from either type exhaust it", async () => {
    const { client, clientProfile, trainer, reformer, energy } = await seed();
    // 2 sessions in the pool, NO per-type quota (ADR-0010): one reformer hold
    // + one energy hold must drain it for BOTH types.
    const mixPkg = await createPackage({
      clientProfileId: clientProfile.id,
      classTypeIds: [reformer.id, energy.id],
      sessionsRemaining: 2,
    });
    const reformerSession = await createSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 24 * 60 * 60 * 1000),
    });
    const energySession = await createSession({
      classTypeId: energy.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 48 * 60 * 60 * 1000),
    });
    const secondReformerSession = await createSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 72 * 60 * 60 * 1000),
    });

    setMockUser({
      id: client.id,
      role: "CLIENT",
      email: client.email,
      isActive: true,
      clientProfile: { id: clientProfile.id },
    });

    const reformerRes = await POST(
      buildJsonRequest({ sessionId: reformerSession.id, action: "BOOK" }),
    );
    expect(reformerRes.status).toBe(200);
    expect((await reformerRes.json()).state).toBe("BOOKED");

    const energyRes = await POST(
      buildJsonRequest({ sessionId: energySession.id, action: "BOOK" }),
    );
    expect(energyRes.status).toBe(200);
    expect((await energyRes.json()).state).toBe("BOOKED");

    // Both bookings hold against the SAME package.
    const bookings = await prisma.booking.findMany({
      where: { clientProfileId: clientProfile.id },
    });
    expect(bookings.map((b) => b.clientPackageId)).toEqual([
      mixPkg.id,
      mixPkg.id,
    ]);

    // Pool of 2 is fully held across the two types → a third booking is
    // rejected even though only ONE reformer session was booked.
    const exhaustedRes = await POST(
      buildJsonRequest({ sessionId: secondReformerSession.id, action: "BOOK" }),
    );
    expect(exhaustedRes.status).toBe(409);
    expect((await exhaustedRes.json()).error).toBe("PACKAGE_EXHAUSTED");
  });

  it("spends the narrowest pack first when client owns single-type + mix", async () => {
    const { client, clientProfile, trainer, reformer, energy } = await seed();
    // Mix pack created FIRST so creation order can't accidentally produce the
    // expected spend order — narrowness must decide, not recency.
    const mixPkg = await createPackage({
      clientProfileId: clientProfile.id,
      classTypeIds: [reformer.id, energy.id],
    });
    const reformerOnlyPkg = await createPackage({
      clientProfileId: clientProfile.id,
      classTypeIds: [reformer.id],
    });
    const reformerSession = await createSession({
      classTypeId: reformer.id,
      trainerUserId: trainer.id,
      startsAt: new Date(nowMs() + 24 * 60 * 60 * 1000),
    });

    setMockUser({
      id: client.id,
      role: "CLIENT",
      email: client.email,
      isActive: true,
      clientProfile: { id: clientProfile.id },
    });

    const res = await POST(
      buildJsonRequest({ sessionId: reformerSession.id, action: "BOOK" }),
    );
    expect(res.status).toBe(200);

    // The reformer-only pack covers fewer types → it burns first, preserving
    // the mix pack's flexibility for energy sessions (ADR-0010 spend priority).
    // sessionsRemaining is NOT decremented at booking time (holds model), so
    // the observable spend is which package the booking is pinned to.
    const booking = await prisma.booking.findFirst({
      where: { sessionId: reformerSession.id, clientProfileId: clientProfile.id },
    });
    expect(booking?.clientPackageId).toBe(reformerOnlyPkg.id);
    expect(mixPkg.id).not.toBe(reformerOnlyPkg.id);
  });
});
