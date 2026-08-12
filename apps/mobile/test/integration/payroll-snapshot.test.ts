import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { GET as GET_MONTH } from "@/server/routes/payroll/month";
import { chargeNoShowConsumption } from "@/lib/server/booking-cancellation";
import { prisma } from "@/lib/server/prisma";

/**
 * A payout line is frozen when the session is consumed, not derived on read.
 *
 * The report used to join booking → package → packageType → price at read
 * time, so editing a price, revoking a package or removing a client silently
 * rewrote a month that had already been paid out. Snapshotting the value (and
 * the names it displays) at consumption time means the past has nothing left
 * to rewrite.
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
  await prisma.trainerRate.create({
    data: {
      trainerUserId: trainer.id,
      percent: 40,
      effectiveFrom: new Date("2026-01-01T05:00:00.000Z"),
    },
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
  return { admin, trainer, classType, packageType };
}

/** One attended, consumed session. Returns the ids involved. */
async function attendAndConsume(seeded: Awaited<ReturnType<typeof seed>>) {
  const clientUser = await prisma.user.create({
    data: {
      email: "klijent@test.local",
      firstName: "Mila",
      lastName: "Klijent",
      role: "CLIENT",
      clientProfile: { create: {} },
    },
    select: { id: true, clientProfile: { select: { id: true } } },
  });
  const clientProfileId = clientUser.clientProfile!.id;

  const pkg = await prisma.clientPackage.create({
    data: {
      clientProfileId,
      packageTypeId: seeded.packageType.id,
      classTypes: { create: { classTypeId: seeded.classType.id } },
      lateCancelHours: 12,
      startsAt: new Date("2026-07-01T05:00:00.000Z"),
      expiresAt: new Date("2026-09-01T05:00:00.000Z"),
      sessionsRemaining: 12,
      sessionsGranted: 12,
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
  await prisma.booking.create({
    data: { sessionId: session.id, clientProfileId, clientPackageId: pkg.id },
  });

  await prisma.$transaction((tx) =>
    chargeNoShowConsumption(tx, {
      clientProfileId,
      sessionId: session.id,
      clientPackageId: pkg.id,
      sessionStartsAt: JULY_SESSION,
      sessionClassTypeId: seeded.classType.id,
    }),
  );

  return { clientUserId: clientUser.id, clientProfileId, packageId: pkg.id, sessionId: session.id };
}

function monthRequest(trainerUserId: string) {
  return new Request(
    `http://test.local/api/payroll/month?year=2026&month=7&trainerUserId=${trainerUserId}`,
  );
}

async function readMonth(seeded: Awaited<ReturnType<typeof seed>>) {
  setMockUser({
    id: seeded.admin.id,
    role: "ADMIN",
    email: seeded.admin.email,
    isActive: true,
    clientProfile: null,
  });
  const res = await GET_MONTH(monthRequest(seeded.trainer.id));
  return (await res.json()).month as {
    gross: number;
    payout: number;
    attendeeCount: number;
    sessions: Array<{
      attendees: Array<{ clientName: string; packageName: string; sessionValue: number | null }>;
    }>;
  };
}

describe("payout lines are frozen at consumption", () => {
  beforeEach(async () => {
    await resetDb();
    process.env.TEST_ANCHOR_TIME = ASOF;
  });

  afterAll(async () => {
    delete process.env.TEST_ANCHOR_TIME;
    await prisma.$disconnect();
  });

  it("writes the per-session value onto the consumption row", async () => {
    const seeded = await seed();
    const { clientProfileId, sessionId } = await attendAndConsume(seeded);

    const consumption = await prisma.sessionConsumption.findUniqueOrThrow({
      where: { clientProfileId_sessionId: { clientProfileId, sessionId } },
    });
    // 15000 / 12
    expect(consumption.sessionValue).toBe(1250);
    expect(consumption.clientName).toBe("Mila Klijent");
    expect(consumption.packageName).toBe("Reformer 12");
    expect(consumption.isGift).toBe(false);
  });

  it("values a 1-session gift at ONE session's rate, not the whole package", async () => {
    // A gift assigns a REAL package but grants a single session. The rate has
    // to come from the SKU's own session count (15000/12 = 1250) — dividing
    // the full price by the single granted session would pay the trainer
    // 15.000 for one training.
    const seeded = await seed();
    const clientUser = await prisma.user.create({
      data: {
        email: "poklon@test.local",
        firstName: "Poklon",
        lastName: "Klijent",
        role: "CLIENT",
        clientProfile: { create: {} },
      },
      select: { clientProfile: { select: { id: true } } },
    });
    const clientProfileId = clientUser.clientProfile!.id;

    const pkg = await prisma.clientPackage.create({
      data: {
        clientProfileId,
        packageTypeId: seeded.packageType.id,
        classTypes: { create: { classTypeId: seeded.classType.id } },
        lateCancelHours: 12,
        startsAt: new Date("2026-07-01T05:00:00.000Z"),
        expiresAt: new Date("2026-09-01T05:00:00.000Z"),
        sessionsRemaining: 1,
        sessionsGranted: 1,
        isGift: true,
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
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId, clientPackageId: pkg.id },
    });
    await prisma.$transaction((tx) =>
      chargeNoShowConsumption(tx, {
        clientProfileId,
        sessionId: session.id,
        clientPackageId: pkg.id,
        sessionStartsAt: JULY_SESSION,
        sessionClassTypeId: seeded.classType.id,
      }),
    );

    const consumption = await prisma.sessionConsumption.findUniqueOrThrow({
      where: { clientProfileId_sessionId: { clientProfileId, sessionId: session.id } },
    });
    expect(consumption.sessionValue).toBe(1250);
    expect(consumption.isGift).toBe(true);
  });

  it("keeps the month unchanged after the package PRICE is edited", async () => {
    const seeded = await seed();
    await attendAndConsume(seeded);
    expect((await readMonth(seeded)).gross).toBe(1250);

    await prisma.packageType.update({
      where: { id: seeded.packageType.id },
      data: { price: 99000 },
    });

    const after = await readMonth(seeded);
    expect(after.gross).toBe(1250);
    expect(after.payout).toBe(500);
  });

  it("keeps the month unchanged after the package is REVOKED", async () => {
    const seeded = await seed();
    const { packageId } = await attendAndConsume(seeded);
    expect((await readMonth(seeded)).gross).toBe(1250);

    await prisma.clientPackage.update({
      where: { id: packageId },
      data: { revokedAt: new Date("2026-08-01T10:00:00.000Z") },
    });

    expect((await readMonth(seeded)).gross).toBe(1250);
  });

  it("keeps the month unchanged after the package row is DELETED", async () => {
    const seeded = await seed();
    const { packageId } = await attendAndConsume(seeded);

    await prisma.booking.updateMany({
      where: { clientPackageId: packageId },
      data: { clientPackageId: null },
    });
    await prisma.clientPackage.delete({ where: { id: packageId } });

    const after = await readMonth(seeded);
    expect(after.gross).toBe(1250);
    expect(after.sessions[0]?.attendees[0]?.packageName).toBe("Reformer 12");
  });

  it("keeps the month — and the client's name — after the CLIENT is deleted", async () => {
    const seeded = await seed();
    const { clientUserId } = await attendAndConsume(seeded);
    expect((await readMonth(seeded)).gross).toBe(1250);

    // Deleting the user cascades to their profile and bookings. The payout is
    // a financial record of work already done, so it must survive — with the
    // name it was earned under, copied rather than joined.
    await prisma.user.delete({ where: { id: clientUserId } });

    const after = await readMonth(seeded);
    expect(after.gross).toBe(1250);
    expect(after.attendeeCount).toBe(1);
    expect(after.sessions[0]?.attendees[0]?.clientName).toBe("Mila Klijent");
  });
});
