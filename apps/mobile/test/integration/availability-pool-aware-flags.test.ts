/**
 * Pool-aware booking flags on GET /api/sessions/availability.
 *
 * The reported bug: a client holding a 9-remaining Reformer 12-pack AND a
 * separate 1-session "Nadoknada" makeup package covering the SAME ClassType set
 * saw the "this spends your last session" warning on every booking, and got
 * locked out entirely once the makeup package alone was held. The home screen
 * already merges those two into one 10-session pool
 * (`lib/active-package-summary.ts`); the booking flags did not, because they
 * measured whichever single package `findEligibleClientPackage` picked — and
 * the 1-session makeup package wins spend priority on soonest expiry.
 *
 * Credits are interchangeable only within an IDENTICAL covered set (ADR-0010),
 * so these specs also pin the negative: a different set must never merge.
 *
 * Anchor: env.setup.ts pins TEST_ANCHOR_TIME to 2026-05-09T10:00:00Z, so all
 * 2026-06 sessions below are in the future and count as holds.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

vi.mock("@/lib/server/notifications", async () => (await import("./notifications-mock")).notificationsMock());

import { GET } from "@/server/routes/sessions/availability";
import { POST as BOOKINGS_POST } from "@/server/routes/bookings";
import { prisma } from "@/lib/server/prisma";

const MONTH = "2026-06";
const SESSION_DATE = new Date("2026-06-15T10:00:00Z");
const OTHER_SESSION_DATE = new Date("2026-06-17T10:00:00Z");
const THIRD_SESSION_DATE = new Date("2026-06-19T10:00:00Z");

async function baseFixtures() {
  const trainer = await prisma.user.create({
    data: { email: "tr@test.local", firstName: "T", lastName: "Trainer", role: "TRAINER" },
  });
  const client = await prisma.user.create({
    data: { email: "c@test.local", firstName: "C", lastName: "Client", role: "CLIENT" },
  });
  const clientProfile = await prisma.clientProfile.create({
    data: { userId: client.id, dateOfBirth: new Date("1990-01-01") },
  });
  const reformer = await prisma.classType.create({
    data: { name: "Reformer pilates", maxClients: 6, durationMins: 60 },
  });
  const personalni = await prisma.classType.create({
    data: { name: "Personalni trening", maxClients: 1, durationMins: 60 },
  });
  return { trainer, client, clientProfile, reformer, personalni };
}

async function makeSession(classTypeId: string, trainerUserId: string, startsAt: Date) {
  return prisma.session.create({
    data: {
      classTypeId,
      trainerUserId,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
      capacity: 6,
      isActive: true,
      status: "SCHEDULED",
    },
  });
}

async function makePackage(opts: {
  clientProfileId: string;
  classTypeId: string;
  name: string;
  sessionsRemaining: number;
  expiresAt?: Date;
}) {
  const packageType = await prisma.packageType.create({
    data: {
      name: `${opts.name}-${Math.random()}`,
      sessionCount: opts.sessionsRemaining,
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
      startsAt: new Date("2026-05-01T00:00:00Z"),
      // Default is LATER than the makeup package's, so the makeup package wins
      // spend priority on soonest expiry — the exact ordering that produced the bug.
      expiresAt: opts.expiresAt ?? new Date("2026-12-01T00:00:00Z"),
      sessionsRemaining: opts.sessionsRemaining,
      sessionsGranted: opts.sessionsRemaining,
    },
  });
}

function buildRequest(month: string) {
  return new Request(
    `http://test.local/api/sessions/availability?month=${encodeURIComponent(month)}`,
  );
}

function asClient(user: { id: string; email: string }, clientProfileId: string) {
  setMockUser({
    id: user.id,
    role: "CLIENT",
    email: user.email,
    isActive: true,
    clientProfile: { id: clientProfileId },
  });
}

describe("GET /api/sessions/availability pool-aware flags", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("does NOT warn last-session when a 1-session makeup package sits beside a 9-session pack of the same set", async () => {
    const { client, clientProfile, trainer, reformer } = await baseFixtures();
    const session = await makeSession(reformer.id, trainer.id, SESSION_DATE);
    await makePackage({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      name: "Reformer 12",
      sessionsRemaining: 9,
    });
    await makePackage({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      name: "Nadoknada",
      sessionsRemaining: 1,
      expiresAt: new Date("2026-06-30T00:00:00Z"),
    });

    asClient(client, clientProfile.id);

    const res = await GET(buildRequest(MONTH));
    const json = await res.json();
    expect(json.sessions).toHaveLength(1);
    // 9 + 1 = 10 bookable in one pool; the old per-package math read the
    // makeup package's lone credit and warned on every single booking.
    expect(json.sessions[0]).toMatchObject({
      id: session.id,
      bookable: true,
      lastBookableSlot: false,
    });
    expect(json.sessions[0].lockReason).toBeUndefined();
  });

  it("does NOT lock FULLY_HELD when only the makeup package is fully held", async () => {
    // The serious half of the bug: the 1-session makeup package's single credit
    // is committed to a future booking, which locked the client out of booking
    // entirely while nine credits sat spendable in the SAME pool.
    const { client, clientProfile, trainer, reformer } = await baseFixtures();
    const bookedSession = await makeSession(reformer.id, trainer.id, SESSION_DATE);
    const openSession = await makeSession(reformer.id, trainer.id, OTHER_SESSION_DATE);
    await makePackage({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      name: "Reformer 12",
      sessionsRemaining: 9,
    });
    const nadoknada = await makePackage({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      name: "Nadoknada",
      sessionsRemaining: 1,
      expiresAt: new Date("2026-06-30T00:00:00Z"),
    });
    await prisma.booking.create({
      data: {
        sessionId: bookedSession.id,
        clientProfileId: clientProfile.id,
        clientPackageId: nadoknada.id,
      },
    });

    asClient(client, clientProfile.id);

    const res = await GET(buildRequest(MONTH));
    const json = await res.json();
    const open = json.sessions.find((s: { id: string }) => s.id === openSession.id);
    // Pool: 10 credits, 1 held → 9 free. Bookable, no warning, no lock.
    expect(open).toMatchObject({
      bookable: true,
      lastBookableSlot: false,
    });
    expect(open.lockReason).toBeUndefined();
  });

  it("still warns last-session when the POOL itself is down to one free slot", async () => {
    // The warning must not simply go quiet — it has to fire on the real last
    // slot of the merged pool.
    const { client, clientProfile, trainer, reformer } = await baseFixtures();
    const bookedSession = await makeSession(reformer.id, trainer.id, SESSION_DATE);
    const openSession = await makeSession(reformer.id, trainer.id, OTHER_SESSION_DATE);
    const pack = await makePackage({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      name: "Reformer 1",
      sessionsRemaining: 1,
    });
    const nadoknada = await makePackage({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      name: "Nadoknada",
      sessionsRemaining: 1,
      expiresAt: new Date("2026-06-30T00:00:00Z"),
    });
    await prisma.booking.create({
      data: {
        sessionId: bookedSession.id,
        clientProfileId: clientProfile.id,
        clientPackageId: nadoknada.id,
      },
    });
    expect(pack.id).not.toBe(nadoknada.id);

    asClient(client, clientProfile.id);

    const res = await GET(buildRequest(MONTH));
    const json = await res.json();
    const open = json.sessions.find((s: { id: string }) => s.id === openSession.id);
    // Pool: 2 credits, 1 held → exactly 1 free slot.
    expect(open).toMatchObject({ bookable: true, lastBookableSlot: true });
  });

  it("locks FULLY_HELD only when every credit in the pool is held", async () => {
    const { client, clientProfile, trainer, reformer } = await baseFixtures();
    const first = await makeSession(reformer.id, trainer.id, SESSION_DATE);
    const second = await makeSession(reformer.id, trainer.id, OTHER_SESSION_DATE);
    const openSession = await makeSession(reformer.id, trainer.id, THIRD_SESSION_DATE);
    const pack = await makePackage({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      name: "Reformer 1",
      sessionsRemaining: 1,
    });
    const nadoknada = await makePackage({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      name: "Nadoknada",
      sessionsRemaining: 1,
      expiresAt: new Date("2026-06-30T00:00:00Z"),
    });
    await prisma.booking.createMany({
      data: [
        {
          sessionId: first.id,
          clientProfileId: clientProfile.id,
          clientPackageId: nadoknada.id,
        },
        {
          sessionId: second.id,
          clientProfileId: clientProfile.id,
          clientPackageId: pack.id,
        },
      ],
    });

    asClient(client, clientProfile.id);

    const res = await GET(buildRequest(MONTH));
    const json = await res.json();
    const open = json.sessions.find((s: { id: string }) => s.id === openSession.id);
    // Pool: 2 credits, 2 held → genuinely nothing left to book.
    expect(open).toMatchObject({
      bookable: false,
      lockReason: "FULLY_HELD",
      lastBookableSlot: false,
    });
  });

  it("counts a waitlist seat ONCE across the pool, not once per package", async () => {
    // Guard for the double-count trap: waitlist rows carry no package FK, so
    // they're scoped by class type. Summing per-package hold counts would read
    // this client's single waitlist seat as TWO holds (one per package) and
    // wrongly flip the last-session warning on.
    const { client, clientProfile, trainer, reformer } = await baseFixtures();
    const waitlistedSession = await makeSession(reformer.id, trainer.id, SESSION_DATE);
    const openSession = await makeSession(reformer.id, trainer.id, OTHER_SESSION_DATE);
    await makePackage({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      name: "Reformer 2",
      sessionsRemaining: 2,
    });
    await makePackage({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      name: "Nadoknada",
      sessionsRemaining: 1,
      expiresAt: new Date("2026-06-30T00:00:00Z"),
    });
    await prisma.waitlistEntry.create({
      data: {
        sessionId: waitlistedSession.id,
        clientProfileId: clientProfile.id,
        position: 1,
      },
    });

    asClient(client, clientProfile.id);

    const res = await GET(buildRequest(MONTH));
    const json = await res.json();
    const open = json.sessions.find((s: { id: string }) => s.id === openSession.id);
    // Pool: 3 credits, 1 waitlist hold → 2 free. Double-counting the seat
    // would give 1 free and wrongly raise lastBookableSlot.
    expect(open).toMatchObject({ bookable: true, lastBookableSlot: false });
  });

  it("does NOT merge packages with a different covered set", async () => {
    // A Personalni credit cannot back a Reformer session, so it must not mask
    // the Reformer pool being down to its last slot.
    const { client, clientProfile, trainer, reformer, personalni } = await baseFixtures();
    const reformerSession = await makeSession(reformer.id, trainer.id, SESSION_DATE);
    await makePackage({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      name: "Reformer 1",
      sessionsRemaining: 1,
    });
    await makePackage({
      clientProfileId: clientProfile.id,
      classTypeId: personalni.id,
      name: "Personalni 8",
      sessionsRemaining: 8,
    });

    asClient(client, clientProfile.id);

    const res = await GET(buildRequest(MONTH));
    const json = await res.json();
    const out = json.sessions.find((s: { id: string }) => s.id === reformerSession.id);
    expect(out).toMatchObject({ bookable: true, lastBookableSlot: true });
  });

  it("lets the booking route through when availability says bookable (the two gates agree)", async () => {
    // The drift that makes this worst: a calendar row rendered bookable that
    // 409s on tap. Both routes resolve the same pool gate, so the row the
    // availability spec above calls bookable must actually book.
    const { client, clientProfile, trainer, reformer } = await baseFixtures();
    const bookedSession = await makeSession(reformer.id, trainer.id, SESSION_DATE);
    const openSession = await makeSession(reformer.id, trainer.id, OTHER_SESSION_DATE);
    const pack = await makePackage({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      name: "Reformer 12",
      sessionsRemaining: 9,
    });
    const nadoknada = await makePackage({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      name: "Nadoknada",
      sessionsRemaining: 1,
      expiresAt: new Date("2026-06-30T00:00:00Z"),
    });
    // The makeup package's lone credit is already committed.
    await prisma.booking.create({
      data: {
        sessionId: bookedSession.id,
        clientProfileId: clientProfile.id,
        clientPackageId: nadoknada.id,
      },
    });

    asClient(client, clientProfile.id);

    const res = await BOOKINGS_POST(
      new Request("http://test.local/api/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "BOOK", sessionId: openSession.id }),
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ success: true, state: "BOOKED" });

    // And it spent the 12-pack, not the exhausted makeup package: consumption
    // decrements the booking's OWN package and no-ops at zero, so attaching
    // here would silently lose a paid credit.
    const booking = await prisma.booking.findFirst({
      where: { sessionId: openSession.id, clientProfileId: clientProfile.id },
      select: { clientPackageId: true },
    });
    expect(booking?.clientPackageId).toBe(pack.id);
    expect(booking?.clientPackageId).not.toBe(nadoknada.id);
  });

  it("still 409s package_exhausted when the whole pool is held", async () => {
    const { client, clientProfile, trainer, reformer } = await baseFixtures();
    const first = await makeSession(reformer.id, trainer.id, SESSION_DATE);
    const openSession = await makeSession(reformer.id, trainer.id, OTHER_SESSION_DATE);
    const nadoknada = await makePackage({
      clientProfileId: clientProfile.id,
      classTypeId: reformer.id,
      name: "Nadoknada",
      sessionsRemaining: 1,
      expiresAt: new Date("2026-06-30T00:00:00Z"),
    });
    await prisma.booking.create({
      data: {
        sessionId: first.id,
        clientProfileId: clientProfile.id,
        clientPackageId: nadoknada.id,
      },
    });

    asClient(client, clientProfile.id);

    const res = await BOOKINGS_POST(
      new Request("http://test.local/api/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "BOOK", sessionId: openSession.id }),
      }),
    );
    expect(res.status).toBe(409);
  });
});
