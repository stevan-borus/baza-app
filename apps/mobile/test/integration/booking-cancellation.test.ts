import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  applyLateCancelForfeit,
  chargeNoShowConsumption,
  promoteNextWaitlistEntry,
} from "@/lib/server/booking-cancellation";
import { now, nowMs } from "@/lib/now";
import { prisma } from "@/lib/server/prisma";
import { resetDb } from "./setup-db";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

async function seedBaseline() {
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
  const packageType = await prisma.packageType.create({
    data: {
      name: "Reformer 12-pack",
      sessionCount: 12,
      validityDays: 30,
      lateCancelHours: 12,
      classTypes: { create: { classTypeId: reformer.id } },
    },
  });
  const clientPackage = await prisma.clientPackage.create({
    data: {
      clientProfileId: clientProfile.id,
      packageTypeId: packageType.id,
      classTypes: { create: { classTypeId: reformer.id } },
      lateCancelHours: 12,
      startsAt: new Date(nowMs() - 5 * DAY_MS),
      expiresAt: new Date(nowMs() + 30 * DAY_MS),
      sessionsRemaining: 8,
    },
  });
  return { trainer, client, clientProfile, reformer, packageType, clientPackage };
}

async function createSession(opts: {
  classTypeId: string;
  trainerUserId: string;
  startsAtMsFromNow: number;
  capacity?: number;
}) {
  const startsAt = new Date(nowMs() + opts.startsAtMsFromNow);
  return prisma.session.create({
    data: {
      classTypeId: opts.classTypeId,
      trainerUserId: opts.trainerUserId,
      startsAt,
      endsAt: new Date(startsAt.getTime() + HOUR_MS),
      capacity: opts.capacity ?? 6,
      isActive: true,
      status: "SCHEDULED",
    },
  });
}

async function seedClientWithPackage(opts: {
  email: string;
  classTypeId: string;
  packageTypeId: string;
  sessionsRemaining?: number;
}) {
  const user = await prisma.user.create({
    data: { email: opts.email, firstName: "Client", lastName: opts.email, role: "CLIENT" },
  });
  const profile = await prisma.clientProfile.create({
    data: { userId: user.id, dateOfBirth: new Date("1990-01-01") },
  });
  const clientPackage = await prisma.clientPackage.create({
    data: {
      clientProfileId: profile.id,
      packageTypeId: opts.packageTypeId,
      classTypes: { create: { classTypeId: opts.classTypeId } },
      lateCancelHours: 12,
      startsAt: new Date(nowMs() - DAY_MS),
      expiresAt: new Date(nowMs() + 30 * DAY_MS),
      sessionsRemaining: opts.sessionsRemaining ?? 8,
    },
  });
  return { user, profile, clientPackage };
}

describe("booking-cancellation module", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  describe("applyLateCancelForfeit", () => {
    it("late cancel forfeits exactly one session and creates one SessionConsumption", async () => {
      const { trainer, clientProfile, reformer, clientPackage } = await seedBaseline();
      // Session 6h away, lateCancelHours = 12 → cancellation now is inside the window.
      const session = await createSession({
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAtMsFromNow: 6 * HOUR_MS,
      });

      const result = await applyLateCancelForfeit(prisma, {
        clientProfileId: clientProfile.id,
        sessionId: session.id,
        clientPackageId: clientPackage.id,
        sessionStartsAt: session.startsAt,
        canceledAt: now(),
        lateCancelHours: clientPackage.lateCancelHours,
      });

      expect(result).toBe("FORFEITED");
      const pack = await prisma.clientPackage.findUnique({ where: { id: clientPackage.id } });
      expect(pack?.sessionsRemaining).toBe(7);
      const consumptions = await prisma.sessionConsumption.findMany({
        where: { sessionId: session.id, clientProfileId: clientProfile.id },
      });
      expect(consumptions).toHaveLength(1);
    });

    it("repeated forfeit keeps a single SessionConsumption row (existing-consumption guard)", async () => {
      const { trainer, clientProfile, reformer, clientPackage } = await seedBaseline();
      const session = await createSession({
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAtMsFromNow: 6 * HOUR_MS,
      });
      const input = {
        clientProfileId: clientProfile.id,
        sessionId: session.id,
        clientPackageId: clientPackage.id,
        sessionStartsAt: session.startsAt,
        canceledAt: now(),
        lateCancelHours: clientPackage.lateCancelHours,
      };

      await applyLateCancelForfeit(prisma, input);
      await applyLateCancelForfeit(prisma, input);

      const consumptions = await prisma.sessionConsumption.findMany({
        where: { sessionId: session.id, clientProfileId: clientProfile.id },
      });
      expect(consumptions).toHaveLength(1);
      // Characterization: the decrement itself is per-call — call-level
      // idempotency lives at the endpoints (the `canceledAt: null` guard).
      const pack = await prisma.clientPackage.findUnique({ where: { id: clientPackage.id } });
      expect(pack?.sessionsRemaining).toBe(6);
    });

    it("charge waiver skips the forfeit entirely — no consumption row, no decrement", async () => {
      const { trainer, clientProfile, reformer, clientPackage } = await seedBaseline();
      const session = await createSession({
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAtMsFromNow: 6 * HOUR_MS,
      });

      const result = await applyLateCancelForfeit(prisma, {
        clientProfileId: clientProfile.id,
        sessionId: session.id,
        clientPackageId: clientPackage.id,
        sessionStartsAt: session.startsAt,
        canceledAt: now(),
        lateCancelHours: clientPackage.lateCancelHours,
        waiveCharge: true,
      });

      expect(result).toBe("WAIVED");
      const pack = await prisma.clientPackage.findUnique({ where: { id: clientPackage.id } });
      expect(pack?.sessionsRemaining).toBe(8);
      const consumption = await prisma.sessionConsumption.findFirst({
        where: { sessionId: session.id, clientProfileId: clientProfile.id },
      });
      expect(consumption).toBeNull();
    });

    it("early cancel (before the cutoff) is free — no consumption, no decrement", async () => {
      const { trainer, clientProfile, reformer, clientPackage } = await seedBaseline();
      // Session 48h away, lateCancelHours = 12 → cancellation now is well outside.
      const session = await createSession({
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAtMsFromNow: 48 * HOUR_MS,
      });

      const result = await applyLateCancelForfeit(prisma, {
        clientProfileId: clientProfile.id,
        sessionId: session.id,
        clientPackageId: clientPackage.id,
        sessionStartsAt: session.startsAt,
        canceledAt: now(),
        lateCancelHours: clientPackage.lateCancelHours,
      });

      expect(result).toBe("EARLY");
      const pack = await prisma.clientPackage.findUnique({ where: { id: clientPackage.id } });
      expect(pack?.sessionsRemaining).toBe(8);
      const consumption = await prisma.sessionConsumption.findFirst({
        where: { sessionId: session.id, clientProfileId: clientProfile.id },
      });
      expect(consumption).toBeNull();
    });

    it("unbacked booking forfeit records the consumption but touches no package", async () => {
      const { trainer, clientProfile, reformer, clientPackage } = await seedBaseline();
      const session = await createSession({
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAtMsFromNow: 6 * HOUR_MS,
      });

      const result = await applyLateCancelForfeit(prisma, {
        clientProfileId: clientProfile.id,
        sessionId: session.id,
        clientPackageId: null,
        sessionStartsAt: session.startsAt,
        canceledAt: now(),
        lateCancelHours: 12,
      });

      expect(result).toBe("FORFEITED");
      const consumptions = await prisma.sessionConsumption.findMany({
        where: { sessionId: session.id, clientProfileId: clientProfile.id },
      });
      expect(consumptions).toHaveLength(1);
      const pack = await prisma.clientPackage.findUnique({ where: { id: clientPackage.id } });
      expect(pack?.sessionsRemaining).toBe(8);
    });
  });

  describe("promoteNextWaitlistEntry", () => {
    it("promotes the first entry (position, then createdAt) into a booking backed by the eligible package", async () => {
      const { trainer, reformer, packageType } = await seedBaseline();
      const session = await createSession({
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAtMsFromNow: 48 * HOUR_MS,
        capacity: 1,
      });
      const first = await seedClientWithPackage({
        email: "wait1@test.local",
        classTypeId: reformer.id,
        packageTypeId: packageType.id,
      });
      const second = await seedClientWithPackage({
        email: "wait2@test.local",
        classTypeId: reformer.id,
        packageTypeId: packageType.id,
      });
      await prisma.waitlistEntry.create({
        data: { sessionId: session.id, clientProfileId: second.profile.id, position: 2 },
      });
      await prisma.waitlistEntry.create({
        data: { sessionId: session.id, clientProfileId: first.profile.id, position: 1 },
      });

      const promotedUserId = await prisma.$transaction((tx) =>
        promoteNextWaitlistEntry(tx, session.id),
      );

      expect(promotedUserId).toBe(first.user.id);
      const booking = await prisma.booking.findUnique({
        where: {
          sessionId_clientProfileId: {
            sessionId: session.id,
            clientProfileId: first.profile.id,
          },
        },
      });
      expect(booking?.canceledAt).toBeNull();
      expect(booking?.clientPackageId).toBe(first.clientPackage.id);
      const firstEntry = await prisma.waitlistEntry.findUnique({
        where: {
          sessionId_clientProfileId: {
            sessionId: session.id,
            clientProfileId: first.profile.id,
          },
        },
      });
      expect(firstEntry).toBeNull();
    });

    it("recompacts the remaining waitlist positions after a promotion", async () => {
      const { trainer, reformer, packageType } = await seedBaseline();
      const session = await createSession({
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAtMsFromNow: 48 * HOUR_MS,
        capacity: 1,
      });
      const clients = [];
      for (const email of ["wait1@test.local", "wait2@test.local", "wait3@test.local"]) {
        clients.push(
          await seedClientWithPackage({
            email,
            classTypeId: reformer.id,
            packageTypeId: packageType.id,
          }),
        );
      }
      for (const [index, c] of clients.entries()) {
        await prisma.waitlistEntry.create({
          data: { sessionId: session.id, clientProfileId: c.profile.id, position: index + 1 },
        });
      }

      const promotedUserId = await prisma.$transaction((tx) =>
        promoteNextWaitlistEntry(tx, session.id),
      );

      expect(promotedUserId).toBe(clients[0].user.id);
      const remaining = await prisma.waitlistEntry.findMany({
        where: { sessionId: session.id },
        orderBy: { position: "asc" },
        select: { clientProfileId: true, position: true },
      });
      expect(remaining).toEqual([
        { clientProfileId: clients[1].profile.id, position: 1 },
        { clientProfileId: clients[2].profile.id, position: 2 },
      ]);
    });

    it("with no eligible package, drops the entry without booking and returns null (current behavior)", async () => {
      const { trainer, reformer } = await seedBaseline();
      const session = await createSession({
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAtMsFromNow: 48 * HOUR_MS,
        capacity: 1,
      });
      // Waitlisted client with NO package at all.
      const user = await prisma.user.create({
        data: { email: "nopack@test.local", firstName: "No", lastName: "Pack", role: "CLIENT" },
      });
      const profile = await prisma.clientProfile.create({
        data: { userId: user.id, dateOfBirth: new Date("1990-01-01") },
      });
      await prisma.waitlistEntry.create({
        data: { sessionId: session.id, clientProfileId: profile.id, position: 1 },
      });

      const promotedUserId = await prisma.$transaction((tx) =>
        promoteNextWaitlistEntry(tx, session.id),
      );

      // Characterization: the unpromotable entry is consumed (deleted), no
      // booking is created, and nobody further down is attempted.
      expect(promotedUserId).toBeNull();
      const booking = await prisma.booking.findFirst({
        where: { sessionId: session.id, clientProfileId: profile.id },
      });
      expect(booking).toBeNull();
      const entries = await prisma.waitlistEntry.count({ where: { sessionId: session.id } });
      expect(entries).toBe(0);
    });
  });

  describe("chargeNoShowConsumption", () => {
    it("charges a package-backed no-show: decrements and records the consumption", async () => {
      const { trainer, clientProfile, reformer, clientPackage } = await seedBaseline();
      // Session already ended (the cron only runs at session-end).
      const session = await createSession({
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAtMsFromNow: -3 * HOUR_MS,
      });

      const outcome = await prisma.$transaction((tx) =>
        chargeNoShowConsumption(tx, {
          clientProfileId: clientProfile.id,
          sessionId: session.id,
          clientPackageId: clientPackage.id,
          sessionStartsAt: session.startsAt,
          sessionClassTypeId: session.classTypeId,
        }),
      );

      expect(outcome).toBe("CONSUMED");
      const pack = await prisma.clientPackage.findUnique({ where: { id: clientPackage.id } });
      expect(pack?.sessionsRemaining).toBe(7);
      const consumptions = await prisma.sessionConsumption.findMany({
        where: { sessionId: session.id, clientProfileId: clientProfile.id },
      });
      expect(consumptions).toHaveLength(1);
    });

    it("reports ALREADY_CONSUMED without a second decrement when a consumption exists", async () => {
      const { trainer, clientProfile, reformer, clientPackage } = await seedBaseline();
      const session = await createSession({
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAtMsFromNow: -3 * HOUR_MS,
      });
      const input = {
        clientProfileId: clientProfile.id,
        sessionId: session.id,
        clientPackageId: clientPackage.id,
        sessionStartsAt: session.startsAt,
        sessionClassTypeId: session.classTypeId,
      };
      await prisma.$transaction((tx) => chargeNoShowConsumption(tx, input));

      const outcome = await prisma.$transaction((tx) => chargeNoShowConsumption(tx, input));

      expect(outcome).toBe("ALREADY_CONSUMED");
      const pack = await prisma.clientPackage.findUnique({ where: { id: clientPackage.id } });
      expect(pack?.sessionsRemaining).toBe(7);
    });

    it("late-binds an unbacked booking to the eligible package and consumes from it", async () => {
      const { trainer, clientProfile, reformer, clientPackage } = await seedBaseline();
      const session = await createSession({
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAtMsFromNow: -3 * HOUR_MS,
      });

      const outcome = await prisma.$transaction((tx) =>
        chargeNoShowConsumption(tx, {
          clientProfileId: clientProfile.id,
          sessionId: session.id,
          clientPackageId: null,
          sessionStartsAt: session.startsAt,
          sessionClassTypeId: session.classTypeId,
        }),
      );

      expect(outcome).toBe("CONSUMED");
      const pack = await prisma.clientPackage.findUnique({ where: { id: clientPackage.id } });
      expect(pack?.sessionsRemaining).toBe(7);
      const consumptions = await prisma.sessionConsumption.findMany({
        where: { sessionId: session.id, clientProfileId: clientProfile.id },
      });
      expect(consumptions).toHaveLength(1);
    });

    it("reports NO_PACKAGE for an unbacked booking with no eligible package, recording nothing", async () => {
      const { trainer, reformer } = await seedBaseline();
      const session = await createSession({
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAtMsFromNow: -3 * HOUR_MS,
      });
      const user = await prisma.user.create({
        data: { email: "nopack@test.local", firstName: "No", lastName: "Pack", role: "CLIENT" },
      });
      const profile = await prisma.clientProfile.create({
        data: { userId: user.id, dateOfBirth: new Date("1990-01-01") },
      });

      const outcome = await prisma.$transaction((tx) =>
        chargeNoShowConsumption(tx, {
          clientProfileId: profile.id,
          sessionId: session.id,
          clientPackageId: null,
          sessionStartsAt: session.startsAt,
          sessionClassTypeId: session.classTypeId,
        }),
      );

      expect(outcome).toBe("NO_PACKAGE");
      const consumption = await prisma.sessionConsumption.findFirst({
        where: { sessionId: session.id, clientProfileId: profile.id },
      });
      expect(consumption).toBeNull();
    });

    it("reports NO_PACKAGE when the backing package is empty — no consumption is recorded", async () => {
      const { trainer, clientProfile, reformer, clientPackage } = await seedBaseline();
      await prisma.clientPackage.update({
        where: { id: clientPackage.id },
        data: { sessionsRemaining: 0 },
      });
      const session = await createSession({
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        startsAtMsFromNow: -3 * HOUR_MS,
      });

      const outcome = await prisma.$transaction((tx) =>
        chargeNoShowConsumption(tx, {
          clientProfileId: clientProfile.id,
          sessionId: session.id,
          clientPackageId: clientPackage.id,
          sessionStartsAt: session.startsAt,
          sessionClassTypeId: session.classTypeId,
        }),
      );

      // Unlike the cancel-time forfeit, the no-show charge requires a real
      // decrement — an empty package surfaces as unbacked attendance.
      expect(outcome).toBe("NO_PACKAGE");
      const pack = await prisma.clientPackage.findUnique({ where: { id: clientPackage.id } });
      expect(pack?.sessionsRemaining).toBe(0);
      const consumption = await prisma.sessionConsumption.findFirst({
        where: { sessionId: session.id, clientProfileId: clientProfile.id },
      });
      expect(consumption).toBeNull();
    });
  });
});
