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
    // No overrides in play, so the whole month sits in one default bucket.
    expect(body.month.buckets).toEqual([
      {
        classTypeId: null,
        classTypeName: null,
        percent: 40,
        gross: 3875,
        payout: 1550,
      },
    ]);
    // The old single `percent` field is gone — the breakdown replaced it.
    expect(body.month.percent).toBeUndefined();
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

  it("still shows an attendee the cron could not charge, next to consumed ones", async () => {
    // Production shape: when a booking has no eligible package the consumption
    // cron writes NO row for it at all (chargeNoShowConsumption returns
    // NO_PACKAGE before recordConsumption). Its session-mates DO get frozen,
    // so the session ends up part-snapshotted. Reading snapshots-or-bookings
    // dropped that attendee from the report entirely — the studio lost the one
    // signal telling them somebody trained without a package.
    const seeded = await seed();
    const session = await makeSession(seeded, seeded.trainer.id, JULY_SESSION);

    const paidProfile = await makeClient("Placena");
    const paidPkg = await givePackage(paidProfile, seeded.reformer12.id, seeded.classType.id, {
      sessionsGranted: 12,
    });
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: paidProfile, clientPackageId: paidPkg.id },
    });
    // Frozen, the way the cron would.
    await prisma.sessionConsumption.create({
      data: {
        clientProfileId: paidProfile,
        sessionId: session.id,
        sessionValue: 1250,
        clientName: "Placena Klijent",
        packageName: "Reformer 12",
        isGift: false,
      },
    });

    // Attended, never charged, no consumption row.
    const unbackedProfile = await makeClient("Bezpaketa");
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId: unbackedProfile, clientPackageId: null },
    });

    asUser(seeded.admin);
    const res = await GET_MONTH(
      monthRequest({ year: "2026", month: "7", trainerUserId: seeded.trainer.id }),
    );
    const body = await res.json();

    expect(body.month.attendeeCount).toBe(2);
    expect(body.month.unpricedCount).toBe(1);
    // The paid one still counts exactly once — no double-count from reading
    // both the snapshot and its own booking.
    expect(body.month.gross).toBe(1250);
    const names = body.month.sessions[0].attendees.map(
      (a: { clientName: string }) => a.clientName,
    );
    expect(names).toContain("Bezpaketa Klijent");
  });

  it("reports a null-percent bucket (and a zero payout) when the trainer has no rate", async () => {
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
    expect(body.month.buckets).toEqual([
      {
        classTypeId: null,
        classTypeName: null,
        percent: null,
        gross: 1250,
        payout: 0,
      },
    ]);
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
    expect(body.month.buckets[0].percent).toBe(40);
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
    expect(body.month.buckets[0].percent).toBe(30);
    // 1250 gross at 30%
    expect(body.month.payout).toBe(375);
  });

  /**
   * Per-class-type overrides. The studio pays a different cut on an individual
   * than on a group slot, so a rate row can be scoped to one class type — and
   * a NULL-percent row on that scope is a tombstone ending the override.
   */
  describe("per-class-type overrides", () => {
    /** A second class type, so a month can contain both. */
    async function addIndividual() {
      return prisma.classType.create({
        data: { name: "Individualni", maxClients: 1, durationMins: 60 },
      });
    }

    /** One attended session of `classTypeId`, worth 15000/12 = 1250. */
    async function heldSession(
      seeded: Awaited<ReturnType<typeof seed>>,
      classTypeId: string,
      clientName: string,
      startsAt: Date,
    ) {
      const session = await prisma.session.create({
        data: {
          classTypeId,
          trainerUserId: seeded.trainer.id,
          startsAt,
          endsAt: new Date(startsAt.getTime() + HOUR),
          capacity: 6,
        },
      });
      const profileId = await makeClient(clientName);
      const pkg = await givePackage(profileId, seeded.reformer12.id, classTypeId, {
        sessionsGranted: 12,
      });
      await prisma.booking.create({
        data: { sessionId: session.id, clientProfileId: profileId, clientPackageId: pkg.id },
      });
      return session;
    }

    it("pays only the overridden class type at its own rate", async () => {
      const seeded = await seed();
      const individual = await addIndividual();
      await prisma.trainerRate.create({
        data: { trainerUserId: seeded.trainer.id, percent: 40, effectiveFrom: new Date("2026-01-01") },
      });
      await prisma.trainerRate.create({
        data: {
          trainerUserId: seeded.trainer.id,
          classTypeId: individual.id,
          percent: 60,
          effectiveFrom: new Date("2026-01-01"),
        },
      });

      await heldSession(seeded, seeded.classType.id, "Grupa", JULY_SESSION);
      await heldSession(seeded, individual.id, "Solo", new Date("2026-07-16T08:00:00.000Z"));

      asUser(seeded.admin);
      const res = await GET_MONTH(
        monthRequest({ year: "2026", month: "7", trainerUserId: seeded.trainer.id }),
      );
      const body = await res.json();

      expect(body.month.buckets).toEqual([
        {
          classTypeId: individual.id,
          classTypeName: "Individualni",
          percent: 60,
          gross: 1250,
          payout: 750,
        },
        {
          classTypeId: null,
          classTypeName: null,
          percent: 40,
          gross: 1250,
          payout: 500,
        },
      ]);
      // 750 + 500 — the group session is untouched by the override.
      expect(body.month.payout).toBe(1250);
      expect(body.month.gross).toBe(2500);
    });

    it("does not reprice a month from an override agreed mid-month", async () => {
      // The whole point of append-only rates: a percentage agreed on the 15th
      // starts on the 15th, and July was already settled at the old one.
      const seeded = await seed();
      const individual = await addIndividual();
      await prisma.trainerRate.create({
        data: { trainerUserId: seeded.trainer.id, percent: 40, effectiveFrom: new Date("2026-01-01") },
      });
      await prisma.trainerRate.create({
        data: {
          trainerUserId: seeded.trainer.id,
          classTypeId: individual.id,
          percent: 60,
          effectiveFrom: new Date("2026-07-15T03:00:00.000Z"),
        },
      });

      await heldSession(seeded, individual.id, "Solo", new Date("2026-07-20T08:00:00.000Z"));

      asUser(seeded.admin);
      const res = await GET_MONTH(
        monthRequest({ year: "2026", month: "7", trainerUserId: seeded.trainer.id }),
      );
      const body = await res.json();

      // The rate is read once, at the month's start — where the override did
      // not exist yet — so July stays on the default 40%.
      expect(body.month.buckets).toEqual([
        {
          classTypeId: null,
          classTypeName: null,
          percent: 40,
          gross: 1250,
          payout: 500,
        },
      ]);
    });

    it("applies an override backdated to the 1st for the whole month", async () => {
      const seeded = await seed();
      const individual = await addIndividual();
      await prisma.trainerRate.create({
        data: { trainerUserId: seeded.trainer.id, percent: 40, effectiveFrom: new Date("2026-01-01") },
      });
      await prisma.trainerRate.create({
        data: {
          trainerUserId: seeded.trainer.id,
          classTypeId: individual.id,
          percent: 60,
          // July's studio-day boundary: 03:00Z (Belgrade is UTC+2 in summer).
          effectiveFrom: new Date("2026-07-01T03:00:00.000Z"),
        },
      });

      await heldSession(seeded, individual.id, "Solo", new Date("2026-07-20T08:00:00.000Z"));

      asUser(seeded.admin);
      const res = await GET_MONTH(
        monthRequest({ year: "2026", month: "7", trainerUserId: seeded.trainer.id }),
      );
      const body = await res.json();

      expect(body.month.buckets[0].classTypeId).toBe(individual.id);
      expect(body.month.buckets[0].percent).toBe(60);
      expect(body.month.payout).toBe(750);
    });

    it("hands a tombstoned class type back to the default rate", async () => {
      const seeded = await seed();
      const individual = await addIndividual();
      await prisma.trainerRate.create({
        data: { trainerUserId: seeded.trainer.id, percent: 40, effectiveFrom: new Date("2026-01-01") },
      });
      await prisma.trainerRate.create({
        data: {
          trainerUserId: seeded.trainer.id,
          classTypeId: individual.id,
          percent: 60,
          effectiveFrom: new Date("2026-02-01"),
        },
      });
      // The override ends before July: percent NULL on the same scope.
      await prisma.trainerRate.create({
        data: {
          trainerUserId: seeded.trainer.id,
          classTypeId: individual.id,
          percent: null,
          effectiveFrom: new Date("2026-06-01"),
        },
      });

      await heldSession(seeded, individual.id, "Solo", new Date("2026-07-20T08:00:00.000Z"));

      asUser(seeded.admin);
      const res = await GET_MONTH(
        monthRequest({ year: "2026", month: "7", trainerUserId: seeded.trainer.id }),
      );
      const body = await res.json();

      // Back in the default bucket entirely — a tombstoned type is not an
      // override any more, so it does not get a row of its own.
      expect(body.month.buckets).toEqual([
        {
          classTypeId: null,
          classTypeName: null,
          percent: 40,
          gross: 1250,
          payout: 500,
        },
      ]);
    });

    it("pays an override even when the trainer has no default rate", async () => {
      const seeded = await seed();
      const individual = await addIndividual();
      await prisma.trainerRate.create({
        data: {
          trainerUserId: seeded.trainer.id,
          classTypeId: individual.id,
          percent: 60,
          effectiveFrom: new Date("2026-01-01"),
        },
      });

      await heldSession(seeded, individual.id, "Solo", new Date("2026-07-20T08:00:00.000Z"));
      await heldSession(seeded, seeded.classType.id, "Grupa", JULY_SESSION);

      asUser(seeded.admin);
      const res = await GET_MONTH(
        monthRequest({ year: "2026", month: "7", trainerUserId: seeded.trainer.id }),
      );
      const body = await res.json();

      expect(body.month.buckets).toEqual([
        {
          classTypeId: individual.id,
          classTypeName: "Individualni",
          percent: 60,
          gross: 1250,
          payout: 750,
        },
        // The group session has no rate to pay it — shown, never quietly zero.
        {
          classTypeId: null,
          classTypeName: null,
          percent: null,
          gross: 1250,
          payout: 0,
        },
      ]);
      expect(body.month.payout).toBe(750);
    });

    it("drops percent from the studio-wide summary rows", async () => {
      const seeded = await seed();
      await prisma.trainerRate.create({
        data: { trainerUserId: seeded.trainer.id, percent: 40, effectiveFrom: new Date("2026-01-01") },
      });
      await heldSession(seeded, seeded.classType.id, "Grupa", JULY_SESSION);

      asUser(seeded.admin);
      const res = await GET_SUMMARY(
        new Request("http://test.local/api/payroll/summary?year=2026&month=7"),
      );
      const body = await res.json();
      const row = body.trainers.find(
        (t: { trainerUserId: string }) => t.trainerUserId === seeded.trainer.id,
      );
      // A trainer no longer has ONE percentage, so the row shows money only.
      expect(row.percent).toBeUndefined();
      expect(row.gross).toBe(1250);
      expect(row.payout).toBe(500);
    });
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

    /**
     * An admin who teaches is the owner covering a class, not a trainer owed a
     * cut of it. Payroll must not have a month for them at all — the owner
     * chose invisible over a zeroed row, so the route answers 404 rather than
     * handing back an empty breakdown that reads like a real, unpaid month.
     */
    async function adminTaughtSession(seeded: Awaited<ReturnType<typeof seed>>) {
      const session = await makeSession(seeded, seeded.admin.id, JULY_SESSION);
      const profileId = await makeClient("AdminGost");
      const pkg = await givePackage(profileId, seeded.reformer12.id, seeded.classType.id, {
        sessionsGranted: 12,
      });
      await prisma.booking.create({
        data: { sessionId: session.id, clientProfileId: profileId, clientPackageId: pkg.id },
      });
      return session;
    }

    it("has no payroll month for an admin who taught a real, priced session", async () => {
      const seeded = await seed();
      // A rate row on the admin would be the worst case: something to pay with.
      await prisma.trainerRate.create({
        data: { trainerUserId: seeded.admin.id, percent: 40, effectiveFrom: new Date("2026-01-01") },
      });
      await adminTaughtSession(seeded);

      asUser(seeded.admin);
      const res = await GET_MONTH(
        monthRequest({ year: "2026", month: "7", trainerUserId: seeded.admin.id }),
      );
      expect(res.status).toBe(404);
    });

    it("gives an admin no month of their own when they pass no id", async () => {
      const seeded = await seed();
      await adminTaughtSession(seeded);

      asUser(seeded.admin);
      const res = await GET_MONTH(monthRequest({ year: "2026", month: "7" }));
      expect(res.status).toBe(404);
    });

    it("still 403s a trainer probing another trainer, rather than 404ing", async () => {
      // Order matters: the ownership check must run before the role lookup, or
      // a trainer could map out who exists by reading the status code.
      const seeded = await seed();

      asUser(seeded.trainer);
      const res = await GET_MONTH(
        monthRequest({ year: "2026", month: "7", trainerUserId: seeded.otherTrainer.id }),
      );
      expect(res.status).toBe(403);
    });

    it("404s a trainerUserId that belongs to nobody", async () => {
      const seeded = await seed();

      asUser(seeded.admin);
      const res = await GET_MONTH(
        monthRequest({
          year: "2026",
          month: "7",
          trainerUserId: "00000000-0000-0000-0000-000000000000",
        }),
      );
      expect(res.status).toBe(404);
    });

    it("omits an admin who taught sessions from the studio-wide summary", async () => {
      const seeded = await seed();
      await adminTaughtSession(seeded);

      asUser(seeded.admin);
      const res = await GET_SUMMARY(
        new Request("http://test.local/api/payroll/summary?year=2026&month=7"),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(
        body.trainers.some(
          (t: { trainerUserId: string }) => t.trainerUserId === seeded.admin.id,
        ),
      ).toBe(false);
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
