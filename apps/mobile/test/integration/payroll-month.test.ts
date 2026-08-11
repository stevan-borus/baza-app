import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { GET as GET_MONTH } from "@/server/routes/payroll/month";
import { GET as GET_SUMMARY } from "@/server/routes/payroll/summary";
import { prisma } from "@/lib/server/prisma";

/**
 * Trainer payroll for a calendar month.
 *
 * The money rule is unit-tested in payroll-valuation.test.ts; this covers what
 * only a real DB can: which bookings count as attendance, and the
 * authorization boundary — a trainer may read their OWN month and nothing else
 * (#123 removed TRAINER from the studio-wide report routes for exactly this
 * reason: they leaked other trainers' figures).
 */

const HOUR = 60 * 60 * 1000;

// A July 2026 session, safely inside the month in Belgrade time.
const JULY_SESSION = new Date("2026-07-15T08:00:00.000Z");
// "Now" for the routes. The server reads the pinned instant from
// TEST_ANCHOR_TIME (see lib/now.ts), NOT from a fake timer — early August, so
// July is a complete, payable month.
const ASOF = "2026-08-05T10:00:00.000Z";

async function seed() {
  const admin = await prisma.user.create({
    data: { email: "admin@test.local", firstName: "Admin", lastName: "User", role: "ADMIN" },
  });
  const trainer = await prisma.user.create({
    data: { email: "trainer@test.local", firstName: "Ana", lastName: "Trener", role: "TRAINER" },
  });
  const otherTrainer = await prisma.user.create({
    data: { email: "other@test.local", firstName: "Bojan", lastName: "Drugi", role: "TRAINER" },
  });
  const classType = await prisma.classType.create({
    data: { name: "Reformer pilates", maxClients: 6, durationMins: 60 },
  });
  const reformer12 = await prisma.packageType.create({
    data: {
      name: "Reformer 12",
      sessionCount: 12,
      validityDays: 60,
      lateCancelHours: 12,
      price: 15000,
      classTypes: { create: { classTypeId: classType.id } },
    },
  });
  const reformer8 = await prisma.packageType.create({
    data: {
      name: "Reformer 8",
      sessionCount: 8,
      validityDays: 60,
      lateCancelHours: 12,
      price: 11000,
      classTypes: { create: { classTypeId: classType.id } },
    },
  });
  return { admin, trainer, otherTrainer, classType, reformer12, reformer8 };
}

async function makeClient(name: string) {
  const user = await prisma.user.create({
    data: {
      email: `${name}@test.local`,
      firstName: name,
      lastName: "Klijent",
      role: "CLIENT",
      clientProfile: { create: {} },
    },
    select: { id: true, clientProfile: { select: { id: true } } },
  });
  return user.clientProfile!.id;
}

async function givePackage(
  clientProfileId: string,
  packageTypeId: string,
  classTypeId: string,
  opts: { isGift?: boolean; sessionsGranted: number },
) {
  return prisma.clientPackage.create({
    data: {
      clientProfileId,
      packageTypeId,
      classTypes: { create: { classTypeId } },
      lateCancelHours: 12,
      startsAt: new Date("2026-07-01T05:00:00.000Z"),
      expiresAt: new Date("2026-09-01T05:00:00.000Z"),
      sessionsRemaining: opts.sessionsGranted,
      sessionsGranted: opts.sessionsGranted,
      isGift: opts.isGift ?? false,
    },
  });
}

async function makeSession(
  seeded: Awaited<ReturnType<typeof seed>>,
  trainerUserId: string,
  startsAt: Date,
) {
  return prisma.session.create({
    data: {
      classTypeId: seeded.classType.id,
      trainerUserId,
      startsAt,
      endsAt: new Date(startsAt.getTime() + HOUR),
      capacity: 6,
    },
  });
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

function monthRequest(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return new Request(`http://test.local/api/payroll/month?${qs}`);
}

describe("GET /api/payroll/month", () => {
  beforeEach(async () => {
    await resetDb();
    process.env.TEST_ANCHOR_TIME = ASOF;
  });

  afterAll(async () => {
    delete process.env.TEST_ANCHOR_TIME;
    await prisma.$disconnect();
  });

  it("values a session from its attendees' packages (the owner's 3.875 example)", async () => {
    const seeded = await seed();
    await prisma.trainerRate.create({
      data: { trainerUserId: seeded.trainer.id, percent: 40, effectiveFrom: new Date("2026-01-01") },
    });
    const session = await makeSession(seeded, seeded.trainer.id, JULY_SESSION);

    for (const name of ["Ana", "Mila"]) {
      const profileId = await makeClient(name);
      const pkg = await givePackage(profileId, seeded.reformer12.id, seeded.classType.id, {
        sessionsGranted: 12,
      });
      await prisma.booking.create({
        data: { sessionId: session.id, clientProfileId: profileId, clientPackageId: pkg.id },
      });
    }
    const thirdProfile = await makeClient("Sara");
    const thirdPkg = await givePackage(thirdProfile, seeded.reformer8.id, seeded.classType.id, {
      sessionsGranted: 8,
    });
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: thirdProfile, clientPackageId: thirdPkg.id },
    });

    asUser(seeded.admin);
    const res = await GET_MONTH(
      monthRequest({ year: "2026", month: "7", trainerUserId: seeded.trainer.id }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    // 15000/12 + 15000/12 + 11000/8 = 1250 + 1250 + 1375
    expect(body.month.gross).toBe(3875);
    expect(body.month.payout).toBe(1550); // 40%
    expect(body.month.sessionCount).toBe(1);
    expect(body.month.attendeeCount).toBe(3);
  });

  it("counts a charged no-show, because the package was still consumed", async () => {
    const seeded = await seed();
    const session = await makeSession(seeded, seeded.trainer.id, JULY_SESSION);
    const profileId = await makeClient("Nina");
    const pkg = await givePackage(profileId, seeded.reformer12.id, seeded.classType.id, {
      sessionsGranted: 12,
    });
    // Never canceled — a late cancel / no-show leaves the booking standing so
    // it still consumes, which is exactly why the trainer is paid for it.
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: profileId, clientPackageId: pkg.id },
    });

    asUser(seeded.admin);
    const res = await GET_MONTH(
      monthRequest({ year: "2026", month: "7", trainerUserId: seeded.trainer.id }),
    );
    const body = await res.json();
    expect(body.month.attendeeCount).toBe(1);
    expect(body.month.gross).toBe(1250);
  });

  it("excludes canceled bookings and canceled sessions", async () => {
    const seeded = await seed();
    const session = await makeSession(seeded, seeded.trainer.id, JULY_SESSION);
    const profileId = await makeClient("Ceca");
    const pkg = await givePackage(profileId, seeded.reformer12.id, seeded.classType.id, {
      sessionsGranted: 12,
    });
    await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId: profileId,
        clientPackageId: pkg.id,
        canceledAt: new Date("2026-07-14T08:00:00.000Z"),
      },
    });

    const canceledSession = await makeSession(
      seeded,
      seeded.trainer.id,
      new Date("2026-07-16T08:00:00.000Z"),
    );
    await prisma.session.update({
      where: { id: canceledSession.id },
      data: { status: "CANCELED" },
    });

    asUser(seeded.admin);
    const res = await GET_MONTH(
      monthRequest({ year: "2026", month: "7", trainerUserId: seeded.trainer.id }),
    );
    const body = await res.json();
    expect(body.month.attendeeCount).toBe(0);
    expect(body.month.gross).toBe(0);
    // The canceled session must not even appear as a held session.
    expect(body.month.sessionCount).toBe(1);
  });

  it("pays a gift attendance at its real package rate and flags it", async () => {
    const seeded = await seed();
    const session = await makeSession(seeded, seeded.trainer.id, JULY_SESSION);
    const profileId = await makeClient("Poklon");
    // A gifted Reformer 12: one session granted, still worth 15000/12.
    const pkg = await givePackage(profileId, seeded.reformer12.id, seeded.classType.id, {
      sessionsGranted: 1,
      isGift: true,
    });
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: profileId, clientPackageId: pkg.id },
    });

    asUser(seeded.admin);
    const res = await GET_MONTH(
      monthRequest({ year: "2026", month: "7", trainerUserId: seeded.trainer.id }),
    );
    const body = await res.json();

    // A gift grants ONE session of a real 12-session package, so the trainer
    // earns one training's worth — 15000/12 — not the package's whole price.
    // The rate always comes from the SKU's session count; what a particular
    // gift handed out changes how many sessions the client gets, not what one
    // of them is worth.
    expect(body.month.giftCount).toBe(1);
    expect(body.month.gross).toBe(1250);
    expect(body.month.sessions[0].attendees[0].isGift).toBe(true);
  });

  it("excludes sessions outside the month and sessions that have not happened yet", async () => {
    const seeded = await seed();
    await makeSession(seeded, seeded.trainer.id, new Date("2026-06-15T08:00:00.000Z"));
    await makeSession(seeded, seeded.trainer.id, new Date("2026-08-15T08:00:00.000Z"));
    // Inside July but in the future relative to asOf — cannot be paid yet.
    await makeSession(seeded, seeded.trainer.id, new Date("2026-07-15T08:00:00.000Z"));

    asUser(seeded.admin);
    const res = await GET_MONTH(
      monthRequest({ year: "2026", month: "7", trainerUserId: seeded.trainer.id }),
    );
    const body = await res.json();
    expect(body.month.sessionCount).toBe(1);
  });

  it("flags an unpriced package instead of quietly counting it as zero", async () => {
    const seeded = await seed();
    const freebie = await prisma.packageType.create({
      data: {
        name: "Nadoknada",
        sessionCount: 1,
        validityDays: 30,
        lateCancelHours: 12,
        classTypes: { create: { classTypeId: seeded.classType.id } },
      },
    });
    const session = await makeSession(seeded, seeded.trainer.id, JULY_SESSION);
    const profileId = await makeClient("Bez");
    const pkg = await givePackage(profileId, freebie.id, seeded.classType.id, {
      sessionsGranted: 1,
    });
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: profileId, clientPackageId: pkg.id },
    });

    asUser(seeded.admin);
    const res = await GET_MONTH(
      monthRequest({ year: "2026", month: "7", trainerUserId: seeded.trainer.id }),
    );
    const body = await res.json();
    expect(body.month.unpricedCount).toBe(1);
    expect(body.month.gross).toBe(0);
    expect(body.month.sessions[0].attendees[0].sessionValue).toBeNull();
  });

  it("reports a null percent (and a zero payout) when the trainer has no rate", async () => {
    const seeded = await seed();
    const session = await makeSession(seeded, seeded.trainer.id, JULY_SESSION);
    const profileId = await makeClient("Rate");
    const pkg = await givePackage(profileId, seeded.reformer12.id, seeded.classType.id, {
      sessionsGranted: 12,
    });
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: profileId, clientPackageId: pkg.id },
    });

    asUser(seeded.admin);
    const res = await GET_MONTH(
      monthRequest({ year: "2026", month: "7", trainerUserId: seeded.trainer.id }),
    );
    const body = await res.json();
    expect(body.month.percent).toBeNull();
    expect(body.month.gross).toBe(1250);
    expect(body.month.payout).toBe(0);
  });

  it("uses the rate in force at the start of the month, not the newest one", async () => {
    const seeded = await seed();
    await prisma.trainerRate.create({
      data: { trainerUserId: seeded.trainer.id, percent: 40, effectiveFrom: new Date("2026-01-01") },
    });
    // A raise AFTER July must not rewrite July's payout.
    await prisma.trainerRate.create({
      data: { trainerUserId: seeded.trainer.id, percent: 60, effectiveFrom: new Date("2026-08-01") },
    });
    const session = await makeSession(seeded, seeded.trainer.id, JULY_SESSION);
    const profileId = await makeClient("Rise");
    const pkg = await givePackage(profileId, seeded.reformer12.id, seeded.classType.id, {
      sessionsGranted: 12,
    });
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: profileId, clientPackageId: pkg.id },
    });

    asUser(seeded.admin);
    const res = await GET_MONTH(
      monthRequest({ year: "2026", month: "7", trainerUserId: seeded.trainer.id }),
    );
    const body = await res.json();
    expect(body.month.percent).toBe(40);
    expect(body.month.payout).toBe(500);
  });

  it("uses the LAST rate entered when several share one effective date", async () => {
    // Correcting a typo produces several rows with the same effectiveFrom,
    // because a rate starts at the studio day boundary. Ordering by that field
    // alone leaves them tied and the payout picks an arbitrary percentage —
    // the admin sets 30% and keeps being paid out at the 20% they replaced.
    const seeded = await seed();
    // Comfortably before July, so the rate is unambiguously in force for the
    // whole month (July's studio-day boundary is 03:00Z — Belgrade is UTC+2 in
    // summer — so a "05:00Z" rate would land AFTER the month started).
    const effectiveFrom = new Date("2026-06-01T05:00:00.000Z");
    const first = await prisma.trainerRate.create({
      data: { trainerUserId: seeded.trainer.id, percent: 20, effectiveFrom },
    });
    const corrected = await prisma.trainerRate.create({
      data: { trainerUserId: seeded.trainer.id, percent: 30, effectiveFrom },
    });
    expect(corrected.createdAt.getTime()).toBeGreaterThanOrEqual(
      first.createdAt.getTime(),
    );

    const session = await makeSession(seeded, seeded.trainer.id, JULY_SESSION);
    const profileId = await makeClient("Ista");
    const pkg = await givePackage(profileId, seeded.reformer12.id, seeded.classType.id, {
      sessionsGranted: 12,
    });
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: profileId, clientPackageId: pkg.id },
    });

    asUser(seeded.admin);
    const res = await GET_MONTH(
      monthRequest({ year: "2026", month: "7", trainerUserId: seeded.trainer.id }),
    );
    const body = await res.json();
    expect(body.month.percent).toBe(30);
    // 1250 gross at 30%
    expect(body.month.payout).toBe(375);
  });

  describe("authorization", () => {
    it("lets a trainer read their own month without passing an id", async () => {
      const seeded = await seed();
      await makeSession(seeded, seeded.trainer.id, JULY_SESSION);

      asUser(seeded.trainer);
      const res = await GET_MONTH(monthRequest({ year: "2026", month: "7" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.month.trainerUserId).toBe(seeded.trainer.id);
    });

    it("never lets a trainer read ANOTHER trainer's month", async () => {
      const seeded = await seed();
      await makeSession(seeded, seeded.otherTrainer.id, JULY_SESSION);

      asUser(seeded.trainer);
      const res = await GET_MONTH(
        monthRequest({ year: "2026", month: "7", trainerUserId: seeded.otherTrainer.id }),
      );
      expect(res.status).toBe(403);
    });

    it("denies clients entirely", async () => {
      await seed();
      const clientUser = await prisma.user.create({
        data: { email: "c@test.local", firstName: "C", lastName: "L", role: "CLIENT" },
      });

      asUser(clientUser);
      const res = await GET_MONTH(monthRequest({ year: "2026", month: "7" }));
      expect(res.status).toBe(403);
    });

    it("keeps the studio-wide summary admin-only", async () => {
      const seeded = await seed();

      asUser(seeded.trainer);
      const trainerRes = await GET_SUMMARY(
        new Request("http://test.local/api/payroll/summary?year=2026&month=7"),
      );
      expect(trainerRes.status).toBe(403);

      asUser(seeded.admin);
      const adminRes = await GET_SUMMARY(
        new Request("http://test.local/api/payroll/summary?year=2026&month=7"),
      );
      expect(adminRes.status).toBe(200);
    });
  });
});
