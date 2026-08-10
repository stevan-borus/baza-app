import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { GET as GET_MONTH } from "@/server/routes/payroll/month";
import { POST as POST_LOCK } from "@/server/routes/payroll/lock";
import { POST as POST_ADJUSTMENT } from "@/server/routes/payroll/adjustments";
import { POST as POST_RATE, GET as GET_RATES } from "@/server/routes/payroll/rates";
import { prisma } from "@/lib/server/prisma";

/**
 * Locking a payroll period.
 *
 * The reason payroll is a period rather than a live report: once a month has
 * been paid out, editing a package price or revoking a package must NOT
 * retroactively rewrite it. Locking snapshots the lines; these tests prove the
 * frozen figure survives exactly the kind of edit that would otherwise move it.
 */

const HOUR = 60 * 60 * 1000;
const JULY_SESSION = new Date("2026-07-15T08:00:00.000Z");
const ASOF = "2026-08-05T10:00:00.000Z";

async function seed() {
  const admin = await prisma.user.create({
    data: { email: "admin@test.local", firstName: "Admin", lastName: "User", role: "ADMIN" },
  });
  const trainer = await prisma.user.create({
    data: { email: "trainer@test.local", firstName: "Ana", lastName: "Trener", role: "TRAINER" },
  });
  const classType = await prisma.classType.create({
    data: { name: "Reformer pilates", maxClients: 6, durationMins: 60 },
  });
  const packageType = await prisma.packageType.create({
    data: {
      name: "Reformer 12",
      sessionCount: 12,
      validityDays: 60,
      lateCancelHours: 12,
      price: 15000,
      classTypes: { create: { classTypeId: classType.id } },
    },
  });
  await prisma.trainerRate.create({
    data: { trainerUserId: trainer.id, percent: 40, effectiveFrom: new Date("2026-01-01") },
  });
  return { admin, trainer, classType, packageType };
}

/** One held July session with a single Reformer-12 attendee → 1250 gross. */
async function seedOneAttendedSession(seeded: Awaited<ReturnType<typeof seed>>) {
  const session = await prisma.session.create({
    data: {
      classTypeId: seeded.classType.id,
      trainerUserId: seeded.trainer.id,
      startsAt: JULY_SESSION,
      endsAt: new Date(JULY_SESSION.getTime() + HOUR),
      capacity: 6,
    },
  });
  const client = await prisma.user.create({
    data: {
      email: "klijent@test.local",
      firstName: "Mila",
      lastName: "Klijent",
      role: "CLIENT",
      clientProfile: { create: {} },
    },
    select: { clientProfile: { select: { id: true } } },
  });
  const profileId = client.clientProfile!.id;
  const pkg = await prisma.clientPackage.create({
    data: {
      clientProfileId: profileId,
      packageTypeId: seeded.packageType.id,
      classTypes: { create: { classTypeId: seeded.classType.id } },
      lateCancelHours: 12,
      startsAt: new Date("2026-07-01T05:00:00.000Z"),
      expiresAt: new Date("2026-09-01T05:00:00.000Z"),
      sessionsRemaining: 12,
      sessionsGranted: 12,
    },
  });
  await prisma.booking.create({
    data: { sessionId: session.id, clientProfileId: profileId, clientPackageId: pkg.id },
  });
  return { session, profileId, pkg };
}

function asUser(user: { id: string; email: string; role: string }) {
  setMockUser({
    id: user.id,
    role: user.role as "ADMIN" | "TRAINER" | "CLIENT",
    email: user.email,
    isActive: true,
    clientProfile: null,
  });
}

function lockRequest(body: unknown) {
  return new Request("http://test.local/api/payroll/lock", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function readMonth(trainerUserId: string) {
  return GET_MONTH(
    new Request(
      `http://test.local/api/payroll/month?year=2026&month=7&trainerUserId=${trainerUserId}`,
    ),
  );
}

describe("POST /api/payroll/lock", () => {
  beforeEach(async () => {
    await resetDb();
    process.env.TEST_ANCHOR_TIME = ASOF;
  });

  afterAll(async () => {
    delete process.env.TEST_ANCHOR_TIME;
    await prisma.$disconnect();
  });

  it("freezes the month so a later price change cannot rewrite it", async () => {
    const seeded = await seed();
    await seedOneAttendedSession(seeded);
    asUser(seeded.admin);

    const lockRes = await POST_LOCK(
      lockRequest({ trainerUserId: seeded.trainer.id, year: 2026, month: 7 }),
    );
    expect(lockRes.status).toBe(200);
    const locked = await lockRes.json();
    expect(locked.status).toBe("LOCKED");
    expect(locked.lineCount).toBe(1);
    expect(locked.payout).toBe(500); // 1250 × 40%

    // The exact edit that would silently move an already-paid month.
    await prisma.packageType.update({
      where: { id: seeded.packageType.id },
      data: { price: 30000 },
    });

    const after = await readMonth(seeded.trainer.id);
    const body = await after.json();
    expect(body.month.status).toBe("LOCKED");
    expect(body.month.gross).toBe(1250);
    expect(body.month.payout).toBe(500);
  });

  it("keeps a locked month stable when the package is revoked afterwards", async () => {
    const seeded = await seed();
    const { pkg } = await seedOneAttendedSession(seeded);
    asUser(seeded.admin);

    await POST_LOCK(lockRequest({ trainerUserId: seeded.trainer.id, year: 2026, month: 7 }));
    await prisma.clientPackage.update({
      where: { id: pkg.id },
      data: { revokedAt: new Date("2026-08-02T10:00:00.000Z") },
    });

    const body = await (await readMonth(seeded.trainer.id)).json();
    expect(body.month.payout).toBe(500);
    expect(body.month.attendeeCount).toBe(1);
  });

  it("recomputes live again once the month is reopened", async () => {
    const seeded = await seed();
    await seedOneAttendedSession(seeded);
    asUser(seeded.admin);

    await POST_LOCK(lockRequest({ trainerUserId: seeded.trainer.id, year: 2026, month: 7 }));
    await prisma.packageType.update({
      where: { id: seeded.packageType.id },
      data: { price: 30000 },
    });

    const unlockRes = await POST_LOCK(
      lockRequest({ trainerUserId: seeded.trainer.id, year: 2026, month: 7, unlock: true }),
    );
    expect(unlockRes.status).toBe(200);
    expect((await unlockRes.json()).status).toBe("OPEN");

    // Reopened: the new price now applies (30000/12 = 2500).
    const body = await (await readMonth(seeded.trainer.id)).json();
    expect(body.month.status).toBe("OPEN");
    expect(body.month.gross).toBe(2500);
  });

  it("keeps both attendees when two clients in a session share a name", async () => {
    const seeded = await seed();
    const session = await prisma.session.create({
      data: {
        classTypeId: seeded.classType.id,
        trainerUserId: seeded.trainer.id,
        startsAt: JULY_SESSION,
        endsAt: new Date(JULY_SESSION.getTime() + HOUR),
        capacity: 6,
      },
    });
    // Same display name, different people — a small studio really does get
    // two "Ana Anić"s, and a name-keyed line would collapse them into one.
    for (const email of ["ana1@test.local", "ana2@test.local"]) {
      const client = await prisma.user.create({
        data: {
          email,
          firstName: "Ana",
          lastName: "Anić",
          role: "CLIENT",
          clientProfile: { create: {} },
        },
        select: { clientProfile: { select: { id: true } } },
      });
      const profileId = client.clientProfile!.id;
      const pkg = await prisma.clientPackage.create({
        data: {
          clientProfileId: profileId,
          packageTypeId: seeded.packageType.id,
          classTypes: { create: { classTypeId: seeded.classType.id } },
          lateCancelHours: 12,
          startsAt: new Date("2026-07-01T05:00:00.000Z"),
          expiresAt: new Date("2026-09-01T05:00:00.000Z"),
          sessionsRemaining: 12,
          sessionsGranted: 12,
        },
      });
      await prisma.booking.create({
        data: { sessionId: session.id, clientProfileId: profileId, clientPackageId: pkg.id },
      });
    }

    asUser(seeded.admin);
    await POST_LOCK(lockRequest({ trainerUserId: seeded.trainer.id, year: 2026, month: 7 }));

    const body = await (await readMonth(seeded.trainer.id)).json();
    expect(body.month.attendeeCount).toBe(2);
    expect(body.month.sessions[0].attendees).toHaveLength(2);
    // Distinct keys, so neither row is dropped when rendered.
    const ids = body.month.sessions[0].attendees.map(
      (a: { bookingId: string }) => a.bookingId,
    );
    expect(new Set(ids).size).toBe(2);
    expect(body.month.gross).toBe(2500);
  });

  it("stores a locked total that equals the sum of its own frozen lines", async () => {
    const seeded = await seed();
    // 13.000 / 12 = 1083.33… — a price that does NOT divide evenly, so an
    // unrounded total and the sum of the rounded lines drift apart. The header
    // must agree with the breakdown it is shown above.
    const uneven = await prisma.packageType.create({
      data: {
        name: "Energy",
        sessionCount: 12,
        validityDays: 60,
        lateCancelHours: 12,
        price: 13000,
        classTypes: { create: { classTypeId: seeded.classType.id } },
      },
    });
    const session = await prisma.session.create({
      data: {
        classTypeId: seeded.classType.id,
        trainerUserId: seeded.trainer.id,
        startsAt: JULY_SESSION,
        endsAt: new Date(JULY_SESSION.getTime() + HOUR),
        capacity: 6,
      },
    });
    for (const email of ["u1@test.local", "u2@test.local", "u3@test.local"]) {
      const client = await prisma.user.create({
        data: {
          email,
          firstName: email[1] ?? "U",
          lastName: "Uneven",
          role: "CLIENT",
          clientProfile: { create: {} },
        },
        select: { clientProfile: { select: { id: true } } },
      });
      const profileId = client.clientProfile!.id;
      const pkg = await prisma.clientPackage.create({
        data: {
          clientProfileId: profileId,
          packageTypeId: uneven.id,
          classTypes: { create: { classTypeId: seeded.classType.id } },
          lateCancelHours: 12,
          startsAt: new Date("2026-07-01T05:00:00.000Z"),
          expiresAt: new Date("2026-09-01T05:00:00.000Z"),
          sessionsRemaining: 12,
          sessionsGranted: 12,
        },
      });
      await prisma.booking.create({
        data: { sessionId: session.id, clientProfileId: profileId, clientPackageId: pkg.id },
      });
    }

    asUser(seeded.admin);
    await POST_LOCK(lockRequest({ trainerUserId: seeded.trainer.id, year: 2026, month: 7 }));

    const body = await (await readMonth(seeded.trainer.id)).json();
    const lineSum = body.month.sessions
      .flatMap((s: { attendees: Array<{ sessionValue: number }> }) => s.attendees)
      .reduce((sum: number, a: { sessionValue: number }) => sum + a.sessionValue, 0);
    // 3 × round(1083.33) = 3249, not the 3250 an unrounded sum would report.
    expect(body.month.gross).toBe(lineSum);
    expect(body.month.gross).toBe(3249);
  });

  it("refuses to lock a month when the trainer has no rate", async () => {
    const seeded = await seed();
    await prisma.trainerRate.deleteMany({ where: { trainerUserId: seeded.trainer.id } });
    await seedOneAttendedSession(seeded);
    asUser(seeded.admin);

    const res = await POST_LOCK(
      lockRequest({ trainerUserId: seeded.trainer.id, year: 2026, month: 7 }),
    );
    expect(res.status).toBe(409);
  });

  it("is admin-only — a trainer cannot lock their own month", async () => {
    const seeded = await seed();
    asUser(seeded.trainer);

    const res = await POST_LOCK(
      lockRequest({ trainerUserId: seeded.trainer.id, year: 2026, month: 7 }),
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/payroll/adjustments", () => {
  beforeEach(async () => {
    await resetDb();
    process.env.TEST_ANCHOR_TIME = ASOF;
  });

  afterAll(async () => {
    delete process.env.TEST_ANCHOR_TIME;
    await prisma.$disconnect();
  });

  function adjustmentRequest(body: unknown) {
    return new Request("http://test.local/api/payroll/adjustments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("adds to the net payout without touching the computed figure", async () => {
    const seeded = await seed();
    await seedOneAttendedSession(seeded);
    asUser(seeded.admin);

    const res = await POST_ADJUSTMENT(
      adjustmentRequest({
        trainerUserId: seeded.trainer.id,
        year: 2026,
        month: 7,
        amount: 1000,
        note: "Bonus za zamenu",
      }),
    );
    expect(res.status).toBe(201);

    const body = await (await readMonth(seeded.trainer.id)).json();
    expect(body.month.payout).toBe(500);
    expect(body.month.adjustmentTotal).toBe(1000);
    expect(body.month.netPayout).toBe(1500);
  });

  it("subtracts when the amount is negative", async () => {
    const seeded = await seed();
    await seedOneAttendedSession(seeded);
    asUser(seeded.admin);

    await POST_ADJUSTMENT(
      adjustmentRequest({
        trainerUserId: seeded.trainer.id,
        year: 2026,
        month: 7,
        amount: -200,
        note: "Ispravka",
      }),
    );

    const body = await (await readMonth(seeded.trainer.id)).json();
    expect(body.month.netPayout).toBe(300);
  });

  it("still applies on a LOCKED month, which is the safe way to correct it", async () => {
    const seeded = await seed();
    await seedOneAttendedSession(seeded);
    asUser(seeded.admin);
    await POST_LOCK(lockRequest({ trainerUserId: seeded.trainer.id, year: 2026, month: 7 }));

    await POST_ADJUSTMENT(
      adjustmentRequest({
        trainerUserId: seeded.trainer.id,
        year: 2026,
        month: 7,
        amount: 250,
        note: "Naknadna ispravka",
      }),
    );

    const body = await (await readMonth(seeded.trainer.id)).json();
    expect(body.month.status).toBe("LOCKED");
    expect(body.month.payout).toBe(500);
    expect(body.month.netPayout).toBe(750);
  });
});

describe("trainer rates", () => {
  beforeEach(async () => {
    await resetDb();
    process.env.TEST_ANCHOR_TIME = ASOF;
  });

  afterAll(async () => {
    delete process.env.TEST_ANCHOR_TIME;
    await prisma.$disconnect();
  });

  function rateRequest(body: unknown) {
    return new Request("http://test.local/api/payroll/rates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("records a new rate without destroying the previous one", async () => {
    const seeded = await seed();
    asUser(seeded.admin);

    const res = await POST_RATE(
      rateRequest({
        trainerUserId: seeded.trainer.id,
        percent: 55,
        effectiveFrom: "2026-09-01",
        note: "Nova stopa",
      }),
    );
    expect(res.status).toBe(201);

    const listed = await GET_RATES(
      new Request(`http://test.local/api/payroll/rates?trainerUserId=${seeded.trainer.id}`),
    );
    const body = await listed.json();
    // Both the seeded 40% and the new 55% survive — history, not overwrite.
    expect(body.rates).toHaveLength(2);
    expect(body.rates.map((r: { percent: number }) => r.percent)).toContain(40);
    expect(body.rates.map((r: { percent: number }) => r.percent)).toContain(55);
  });

  it("rejects a rate for a user who is not a trainer", async () => {
    const seeded = await seed();
    asUser(seeded.admin);

    const res = await POST_RATE(
      rateRequest({
        trainerUserId: seeded.admin.id,
        percent: 50,
        effectiveFrom: "2026-09-01",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("hides rates from trainers entirely", async () => {
    const seeded = await seed();
    asUser(seeded.trainer);

    const res = await GET_RATES(new Request("http://test.local/api/payroll/rates"));
    expect(res.status).toBe(403);
  });
});
