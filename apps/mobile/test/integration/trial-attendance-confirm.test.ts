import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());
vi.mock("@/lib/server/cron-auth", () => ({
  requireCronAuth: (_req: Request) => ({ ok: true as const }),
}));
vi.mock("@/lib/server/notifications", () => ({
  createSystemNotification: async () => undefined as unknown,
}));

import { POST as CONFIRM_TRIAL } from "@/server/routes/bookings/[id]/confirm-trial";
import { POST as RUN_CONSUMPTION_CRON } from "@/server/routes/cron/sessions/consumption";
import { GET as GET_MONTH } from "@/server/routes/payroll/month";
import { prisma } from "@/lib/server/prisma";

/**
 * Confirming a trial (probni) attendance.
 *
 * An admin "reservation" books a visitor with no package. Nothing values that
 * attendance automatically — a trial no-show must not pay the trainer — so the
 * value is frozen only when an admin says the person actually came. The class
 * type carries the price; without one there is nothing to freeze and the
 * report keeps its unpriced warning.
 */

const HOUR = 60 * 60 * 1000;
// A July 2026 session, safely inside the month in Belgrade time.
const JULY_SESSION = new Date("2026-07-15T08:00:00.000Z");
// Early August: July is a complete, payable month.
const ASOF = "2026-08-05T10:00:00.000Z";

async function seed(opts: { trialSessionValue: number | null }) {
  const admin = await prisma.user.create({
    data: { email: "admin@test.local", firstName: "Admin", lastName: "User", role: "ADMIN" },
  });
  const trainer = await prisma.user.create({
    data: { email: "trainer@test.local", firstName: "Ana", lastName: "Trener", role: "TRAINER" },
  });
  const classType = await prisma.classType.create({
    data: {
      name: "Reformer pilates",
      maxClients: 6,
      durationMins: 60,
      trialSessionValue: opts.trialSessionValue,
    },
  });
  await prisma.trainerRate.create({
    data: {
      trainerUserId: trainer.id,
      percent: 40,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    },
  });
  return { admin, trainer, classType };
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

async function makeEndedSession(classTypeId: string, trainerUserId: string) {
  return prisma.session.create({
    data: {
      classTypeId,
      trainerUserId,
      startsAt: JULY_SESSION,
      endsAt: new Date(JULY_SESSION.getTime() + HOUR),
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

function confirmRequest(bookingId: string) {
  return new Request(
    `http://test.local/api/bookings/${bookingId}/confirm-trial`,
    { method: "POST" },
  );
}

async function readMonth(trainerUserId: string) {
  const qs = new URLSearchParams({
    year: "2026",
    month: "7",
    trainerUserId,
  }).toString();
  const res = await GET_MONTH(
    new Request(`http://test.local/api/payroll/month?${qs}`),
  );
  expect(res.status).toBe(200);
  const body = await res.json();
  return body.month;
}

describe("POST /api/bookings/[id]/confirm-trial", () => {
  beforeEach(async () => {
    await resetDb();
    process.env.TEST_ANCHOR_TIME = ASOF;
  });

  afterAll(async () => {
    delete process.env.TEST_ANCHOR_TIME;
    await resetDb();
    await prisma.$disconnect();
  });

  it("freezes the class type's trial value onto the attendance and pays the trainer for it", async () => {
    const seeded = await seed({ trialSessionValue: 2000 });
    const clientProfileId = await makeClient("Mila");
    const session = await makeEndedSession(seeded.classType.id, seeded.trainer.id);
    const booking = await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId,
        createdByUserId: seeded.admin.id,
      },
    });

    asUser(seeded.admin);
    const res = await CONFIRM_TRIAL(confirmRequest(booking.id), { id: booking.id });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.consumption).toMatchObject({
      sessionId: session.id,
      clientProfileId,
      sessionValue: 2000,
      isTrial: true,
    });

    const consumption = await prisma.sessionConsumption.findFirst({
      where: { sessionId: session.id, clientProfileId },
    });
    expect(consumption).toMatchObject({
      sessionValue: 2000,
      clientName: "Mila Klijent",
      packageName: null,
      isGift: false,
      isTrial: true,
    });

    const month = await readMonth(seeded.trainer.id);
    expect(month.sessions[0].attendees[0]).toMatchObject({
      clientName: "Mila Klijent",
      sessionValue: 2000,
      isTrial: true,
      canConfirmTrial: false,
    });
    expect(month.sessions[0].gross).toBe(2000);
    expect(month.sessions[0].unpricedCount).toBe(0);
    expect(month.unpricedCount).toBe(0);
    expect(month.trialCount).toBe(1);
    expect(month.gross).toBe(2000);
    expect(month.payout).toBe(800);
  });

  it("returns 409 on a second confirm of the same booking", async () => {
    const seeded = await seed({ trialSessionValue: 2000 });
    const clientProfileId = await makeClient("Mila");
    const session = await makeEndedSession(seeded.classType.id, seeded.trainer.id);
    const booking = await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId },
    });

    asUser(seeded.admin);
    expect(
      (await CONFIRM_TRIAL(confirmRequest(booking.id), { id: booking.id })).status,
    ).toBe(200);
    const second = await CONFIRM_TRIAL(confirmRequest(booking.id), { id: booking.id });
    expect(second.status).toBe(409);
    expect((await second.json()).error).toBe("Attendance already recorded");
    expect(
      await prisma.sessionConsumption.count({ where: { sessionId: session.id } }),
    ).toBe(1);
  });

  it("returns 400 when the booking is backed by a package", async () => {
    const seeded = await seed({ trialSessionValue: 2000 });
    const clientProfileId = await makeClient("Mila");
    const packageType = await prisma.packageType.create({
      data: {
        name: "Reformer 12",
        sessionCount: 12,
        validityDays: 60,
        lateCancelHours: 12,
        price: 15000,
        classTypes: { create: { classTypeId: seeded.classType.id } },
      },
    });
    const clientPackage = await prisma.clientPackage.create({
      data: {
        clientProfileId,
        packageTypeId: packageType.id,
        classTypes: { create: { classTypeId: seeded.classType.id } },
        lateCancelHours: 12,
        startsAt: new Date("2026-07-01T05:00:00.000Z"),
        expiresAt: new Date("2026-09-01T05:00:00.000Z"),
        sessionsRemaining: 11,
        sessionsGranted: 12,
      },
    });
    const session = await makeEndedSession(seeded.classType.id, seeded.trainer.id);
    const booking = await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId, clientPackageId: clientPackage.id },
    });

    asUser(seeded.admin);
    const res = await CONFIRM_TRIAL(confirmRequest(booking.id), { id: booking.id });
    expect(res.status).toBe(400);
    expect(
      await prisma.sessionConsumption.count({ where: { sessionId: session.id } }),
    ).toBe(0);
  });

  it("returns 400 when the session has not ended yet", async () => {
    const seeded = await seed({ trialSessionValue: 2000 });
    const clientProfileId = await makeClient("Mila");
    const future = new Date(Date.parse(ASOF) + 24 * HOUR);
    const session = await prisma.session.create({
      data: {
        classTypeId: seeded.classType.id,
        trainerUserId: seeded.trainer.id,
        startsAt: future,
        endsAt: new Date(future.getTime() + HOUR),
        capacity: 6,
      },
    });
    const booking = await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId },
    });

    asUser(seeded.admin);
    const res = await CONFIRM_TRIAL(confirmRequest(booking.id), { id: booking.id });
    expect(res.status).toBe(400);
  });

  it("returns 400 when the booking is canceled", async () => {
    const seeded = await seed({ trialSessionValue: 2000 });
    const clientProfileId = await makeClient("Mila");
    const session = await makeEndedSession(seeded.classType.id, seeded.trainer.id);
    const booking = await prisma.booking.create({
      data: {
        sessionId: session.id,
        clientProfileId,
        canceledAt: new Date("2026-07-14T08:00:00.000Z"),
      },
    });

    asUser(seeded.admin);
    const res = await CONFIRM_TRIAL(confirmRequest(booking.id), { id: booking.id });
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown booking id", async () => {
    const seeded = await seed({ trialSessionValue: 2000 });
    asUser(seeded.admin);
    const missing = "00000000-0000-0000-0000-000000000000";
    const res = await CONFIRM_TRIAL(confirmRequest(missing), { id: missing });
    expect(res.status).toBe(404);
  });

  it("returns 409 when the class type carries no trial value, and the report keeps its warning", async () => {
    const seeded = await seed({ trialSessionValue: null });
    const clientProfileId = await makeClient("Mila");
    const session = await makeEndedSession(seeded.classType.id, seeded.trainer.id);
    const booking = await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId },
    });

    asUser(seeded.admin);
    const res = await CONFIRM_TRIAL(confirmRequest(booking.id), { id: booking.id });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(
      "Trial value is not set for this class type",
    );

    const month = await readMonth(seeded.trainer.id);
    expect(month.sessions[0].attendees[0]).toMatchObject({
      sessionValue: null,
      isTrial: false,
      canConfirmTrial: false,
    });
    expect(month.unpricedCount).toBe(1);
    expect(month.trialCount).toBe(0);
  });

  it("leaves an unconfirmed trial unvalued but flagged as confirmable, and the cron does not value it", async () => {
    const seeded = await seed({ trialSessionValue: 2000 });
    const clientProfileId = await makeClient("Mila");
    const session = await makeEndedSession(seeded.classType.id, seeded.trainer.id);
    await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId },
    });

    asUser(seeded.admin);
    const before = await readMonth(seeded.trainer.id);
    expect(before.sessions[0].attendees[0]).toMatchObject({
      sessionValue: null,
      isTrial: false,
      canConfirmTrial: true,
    });
    expect(before.unpricedCount).toBe(1);
    expect(before.trialCount).toBe(0);
    expect(before.gross).toBe(0);

    // The session-end cron must stay hands-off: a trial no-show is not work
    // the studio pays for, so only an explicit confirm freezes a value.
    const cronRes = await RUN_CONSUMPTION_CRON(
      new Request(
        "http://test.local/api/cron/sessions/consumption?mode=immediate",
        { method: "POST" },
      ),
    );
    expect(cronRes.status).toBe(200);
    const cronBody = await cronRes.json();
    expect(cronBody.noEligiblePackage).toBe(1);
    expect(cronBody.consumed).toBe(0);
    expect(
      await prisma.sessionConsumption.count({ where: { sessionId: session.id } }),
    ).toBe(0);

    const after = await readMonth(seeded.trainer.id);
    expect(after.sessions[0].attendees[0].canConfirmTrial).toBe(true);
    expect(after.unpricedCount).toBe(1);
  });

  it("is forbidden for a trainer", async () => {
    const seeded = await seed({ trialSessionValue: 2000 });
    const clientProfileId = await makeClient("Mila");
    const session = await makeEndedSession(seeded.classType.id, seeded.trainer.id);
    const booking = await prisma.booking.create({
      data: { sessionId: session.id, clientProfileId },
    });

    asUser(seeded.trainer);
    const res = await CONFIRM_TRIAL(confirmRequest(booking.id), { id: booking.id });
    expect(res.status).toBe(403);
    expect(
      await prisma.sessionConsumption.count({ where: { sessionId: session.id } }),
    ).toBe(0);
  });
});
