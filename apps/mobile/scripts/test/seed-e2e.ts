/**
 * E2E rich seed.
 *
 * Produces the deterministic dataset every test layer resets to before
 * running. Glossary in CONTEXT.md → "Rich seed" / "Client matrix".
 *
 * - 1 admin
 * - 2 trainers (Reformer Lead, Energy Lead)
 * - 6 clients with the package state matrix:
 *   active reformer / active energy / expired / paused / future-start / empty
 * - 4 ClassTypes, 5 PackageTypes (one per spec'd offering)
 * - 2 StudioRooms
 * - ~14 days of sessions via two recurring schedules per trainer
 *
 * Idempotent: deletes everything mutated below before re-creating, so the same
 * baseline seed can run before every Playwright spec file.
 *
 * Usage:
 *   pnpm tsx scripts/test/seed-e2e.ts
 *   (intended to be invoked from Playwright's globalSetup or a per-spec-file
 *    beforeAll, after `pnpm test:db:prepare`.)
 */

// Side-effect import: populates env defaults before any module that reads env.
import "./seed-e2e-env";

import { UserRole } from "../../generated/prisma";
import { now, nowMs } from "../../lib/now";
import { hashPassword } from "../../lib/server/password";
import { prisma } from "../../lib/server/prisma";

const PASSWORD = "Password123!";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

const USERS = {
  admin: { email: "admin.e2e@example.test", fullName: "Admin E2E", role: UserRole.ADMIN },
  trainerReformer: {
    email: "trainer.reformer@e2e.test",
    fullName: "Trainer Reformer Lead",
    role: UserRole.TRAINER,
  },
  trainerEnergy: {
    email: "trainer.energy@e2e.test",
    fullName: "Trainer Energy Lead",
    role: UserRole.TRAINER,
  },
  activeReformer: {
    email: "client.active.reformer@e2e.test",
    fullName: "Active Reformer Client",
    role: UserRole.CLIENT,
  },
  activeEnergy: {
    email: "client.active.energy@e2e.test",
    fullName: "Active Energy Client",
    role: UserRole.CLIENT,
  },
  expired: {
    email: "client.expired@e2e.test",
    fullName: "Expired Pack Client",
    role: UserRole.CLIENT,
  },
  paused: {
    email: "client.paused@e2e.test",
    fullName: "Paused Pack Client",
    role: UserRole.CLIENT,
  },
  future: {
    email: "client.future@e2e.test",
    fullName: "Future Pack Client",
    role: UserRole.CLIENT,
  },
  empty: {
    email: "client.empty@e2e.test",
    fullName: "Empty Pack Client",
    role: UserRole.CLIENT,
  },
} as const;

const CLASS_TYPES = [
  { name: "Reformer pilates", maxClients: 6, durationMins: 60 },
  { name: "Energy pilates", maxClients: 12, durationMins: 60 },
  { name: "Moms&Minis", maxClients: 8, durationMins: 60 },
  { name: "Golden age pilates", maxClients: 10, durationMins: 60 },
] as const;

const PACKAGE_TYPES = [
  {
    name: "Reformer 12-pack",
    sessionCount: 12,
    validityDays: 30,
    lateCancelHours: 12,
    classTypeName: "Reformer pilates",
  },
  {
    name: "Reformer 8-pack",
    sessionCount: 8,
    validityDays: 30,
    lateCancelHours: 12,
    classTypeName: "Reformer pilates",
  },
  {
    name: "Energy 12-pack",
    sessionCount: 12,
    validityDays: 30,
    lateCancelHours: 12,
    classTypeName: "Energy pilates",
  },
  {
    name: "Moms&Minis 8-pack",
    sessionCount: 8,
    validityDays: 30,
    lateCancelHours: 12,
    classTypeName: "Moms&Minis",
  },
  {
    name: "Golden age 8-pack",
    sessionCount: 8,
    validityDays: 30,
    lateCancelHours: 12,
    classTypeName: "Golden age pilates",
  },
] as const;

const ROOMS = [
  { name: "Sala 1", capacity: 6 },
  { name: "Sala 2", capacity: 12 },
] as const;

/**
 * Wipes the rich-seed surface in dependency-safe order. The migration baseline
 * left by `prisma migrate reset` is preserved; this only touches the rows the
 * rich seed creates.
 */
async function wipe() {
  await prisma.sessionConsumption.deleteMany({});
  await prisma.trainerNote.deleteMany({});
  await prisma.waitlistEntry.deleteMany({});
  await prisma.booking.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.recurringSchedule.deleteMany({});
  await prisma.packagePause.deleteMany({});
  await prisma.clientPackage.deleteMany({});
  await prisma.packageType.deleteMany({});
  await prisma.classType.deleteMany({});
  await prisma.studioRoom.deleteMany({});
  await prisma.billingRecord.deleteMany({});
  await prisma.notificationLog.deleteMany({});
  await prisma.notificationPreference.deleteMany({});
  await prisma.pushToken.deleteMany({});
  await prisma.userInvite.deleteMany({});
  await prisma.passwordResetToken.deleteMany({});
  await prisma.authAccount.deleteMany({});
  await prisma.authSession.deleteMany({});
  await prisma.authVerification.deleteMany({});
  await prisma.clientProfile.deleteMany({});
  await prisma.trainerProfile.deleteMany({});
  await prisma.user.deleteMany({});
}

async function seedUser(input: { email: string; fullName: string; role: UserRole }, hash: string) {
  const user = await prisma.user.create({
    data: {
      email: input.email,
      fullName: input.fullName,
      role: input.role,
      isActive: true,
      passwordHash: hash,
    },
  });
  await prisma.authAccount.create({
    data: {
      userId: user.id,
      providerId: "credential",
      accountId: user.email,
      password: hash,
    },
  });
  let clientProfileId: string | null = null;
  if (input.role === UserRole.CLIENT) {
    const profile = await prisma.clientProfile.create({
      data: { userId: user.id },
    });
    clientProfileId = profile.id;
  }
  return { user, clientProfileId };
}

async function seedCatalog() {
  const classTypeByName = new Map<string, { id: string }>();
  for (const ct of CLASS_TYPES) {
    const created = await prisma.classType.create({
      data: { name: ct.name, maxClients: ct.maxClients, durationMins: ct.durationMins },
      select: { id: true, name: true },
    });
    classTypeByName.set(ct.name, { id: created.id });
  }

  const packageTypeByName = new Map<string, { id: string; classTypeId: string; sessionCount: number; validityDays: number; lateCancelHours: number }>();
  for (const pt of PACKAGE_TYPES) {
    const ct = classTypeByName.get(pt.classTypeName);
    if (!ct) throw new Error(`Missing ClassType ${pt.classTypeName}`);
    const created = await prisma.packageType.create({
      data: {
        name: pt.name,
        sessionCount: pt.sessionCount,
        validityDays: pt.validityDays,
        lateCancelHours: pt.lateCancelHours,
        classTypeId: ct.id,
      },
    });
    packageTypeByName.set(pt.name, {
      id: created.id,
      classTypeId: ct.id,
      sessionCount: pt.sessionCount,
      validityDays: pt.validityDays,
      lateCancelHours: pt.lateCancelHours,
    });
  }

  const rooms = await Promise.all(
    ROOMS.map((r) =>
      prisma.studioRoom.create({
        data: { name: r.name, capacity: r.capacity },
      }),
    ),
  );

  return { classTypeByName, packageTypeByName, rooms };
}

async function seedClientPackages(opts: {
  clients: Map<keyof typeof USERS, { clientProfileId: string; userId: string }>;
  packageTypes: Map<string, { id: string; classTypeId: string; sessionCount: number; validityDays: number; lateCancelHours: number }>;
}) {
  const currentInstant = now();
  const reformer12 = opts.packageTypes.get("Reformer 12-pack")!;
  const energy12 = opts.packageTypes.get("Energy 12-pack")!;

  // Helper: create a paid (Flow 1) ClientPackage + paired BillingRecord.
  async function createPaidPackage(args: {
    clientKey: keyof typeof USERS;
    packageType: typeof reformer12;
    startsAt: Date;
    expiresAt: Date;
    sessionsRemaining: number;
    amount: number;
    method: "CASH" | "CARD" | "COMPANY" | "MANUAL_ONLINE";
    paidAt?: Date;
  }) {
    const client = opts.clients.get(args.clientKey)!;
    await prisma.clientPackage.create({
      data: {
        clientProfileId: client.clientProfileId,
        packageTypeId: args.packageType.id,
        classTypeId: args.packageType.classTypeId,
        lateCancelHours: args.packageType.lateCancelHours,
        startsAt: args.startsAt,
        expiresAt: args.expiresAt,
        sessionsRemaining: args.sessionsRemaining,
      },
    });
    await prisma.billingRecord.create({
      data: {
        clientUserId: client.userId,
        amount: args.amount,
        method: args.method,
        status: "CONFIRMED",
        packageTypeId: args.packageType.id,
        createdAt: args.paidAt ?? args.startsAt,
      },
    });
  }

  // Active reformer (Flow 1, paid) — 12-pack with 8 remaining, plenty of time left.
  await createPaidPackage({
    clientKey: "activeReformer",
    packageType: reformer12,
    startsAt: new Date(currentInstant.getTime() - 5 * DAY_MS),
    expiresAt: new Date(currentInstant.getTime() + 25 * DAY_MS),
    sessionsRemaining: 8,
    amount: 12000,
    method: "CARD",
  });

  // Active energy (Flow 1, paid) — 12-pack full of sessions.
  await createPaidPackage({
    clientKey: "activeEnergy",
    packageType: energy12,
    startsAt: new Date(currentInstant.getTime() - 2 * DAY_MS),
    expiresAt: new Date(currentInstant.getTime() + 28 * DAY_MS),
    sessionsRemaining: 12,
    amount: 13000,
    method: "CASH",
  });

  // Expired (Flow 1, paid) — Reformer pack expired 7 days ago.
  await createPaidPackage({
    clientKey: "expired",
    packageType: reformer12,
    startsAt: new Date(currentInstant.getTime() - 37 * DAY_MS),
    expiresAt: new Date(currentInstant.getTime() - 7 * DAY_MS),
    sessionsRemaining: 4,
    amount: 12000,
    method: "CARD",
  });

  // Paused (Flow 2, comp) — kept on Flow 2 to preserve coverage of the
  // Poklon paket / comp branch in dev + e2e dashboards.
  await prisma.clientPackage.create({
    data: {
      clientProfileId: opts.clients.get("paused")!.clientProfileId,
      packageTypeId: reformer12.id,
      classTypeId: reformer12.classTypeId,
      lateCancelHours: reformer12.lateCancelHours,
      startsAt: new Date(currentInstant.getTime() - 5 * DAY_MS),
      expiresAt: new Date(currentInstant.getTime() + 25 * DAY_MS),
      sessionsRemaining: 10,
    },
  });
  await prisma.packagePause.create({
    data: {
      clientProfileId: opts.clients.get("paused")!.clientProfileId,
      startsAt: new Date(currentInstant.getTime() - DAY_MS),
      endsAt: new Date(currentInstant.getTime() + 7 * DAY_MS),
      reason: "Vacation",
    },
  });

  // Future (Flow 1, paid) — Reformer pack startsAt is 7 days from now.
  await createPaidPackage({
    clientKey: "future",
    packageType: reformer12,
    startsAt: new Date(currentInstant.getTime() + 7 * DAY_MS),
    expiresAt: new Date(currentInstant.getTime() + 37 * DAY_MS),
    sessionsRemaining: 12,
    amount: 12000,
    // Future pack was historically tagged QR; that enum value is gone now
    // (PR β migrated QR rows -> CASH), so this seeds with CASH directly.
    method: "CASH",
    paidAt: new Date(currentInstant.getTime() - DAY_MS),
  });

  // Empty — no clientPackage rows. Nothing to do.
}

async function seedSessions(opts: {
  trainers: { reformer: { id: string }; energy: { id: string } };
  classTypes: Map<string, { id: string }>;
  rooms: { id: string; name: string }[];
}) {
  const reformer = opts.classTypes.get("Reformer pilates")!;
  const energy = opts.classTypes.get("Energy pilates")!;
  const sala1 = opts.rooms.find((r) => r.name === "Sala 1")!;
  const sala2 = opts.rooms.find((r) => r.name === "Sala 2")!;

  const baseDay = now();
  baseDay.setHours(10, 0, 0, 0);

  // Two recurring schedules: Reformer Mon/Wed/Fri × 2 weeks at 10:00 (Sala 1),
  // Energy Tue/Thu × 2 weeks at 18:00 (Sala 2). Roughly 14 days of cover.
  type ScheduleSpec = {
    name: string;
    classTypeId: string;
    trainerUserId: string;
    roomId: string;
    weekdays: number[];
    weekCount: number;
    timeOfDayHours: number;
  };

  const schedules: ScheduleSpec[] = [
    {
      name: "Reformer Mon/Wed/Fri 10:00",
      classTypeId: reformer.id,
      trainerUserId: opts.trainers.reformer.id,
      roomId: sala1.id,
      weekdays: [1, 3, 5],
      weekCount: 2,
      timeOfDayHours: 10,
    },
    {
      name: "Energy Tue/Thu 18:00",
      classTypeId: energy.id,
      trainerUserId: opts.trainers.energy.id,
      roomId: sala2.id,
      weekdays: [2, 4],
      weekCount: 2,
      timeOfDayHours: 18,
    },
  ];

  for (const spec of schedules) {
    const schedule = await prisma.recurringSchedule.create({
      data: {
        classTypeId: spec.classTypeId,
        trainerUserId: spec.trainerUserId,
        roomId: spec.roomId,
        weekdays: spec.weekdays,
        timeOfDayMins: spec.timeOfDayHours * 60,
        durationMins: 60,
        capacity: 6,
        isActive: true,
      },
    });

    const weekStart = new Date(baseDay);
    weekStart.setDate(baseDay.getDate() - baseDay.getDay()); // Sunday-anchored

    for (let week = 0; week < spec.weekCount; week++) {
      for (const dow of spec.weekdays) {
        const startsAt = new Date(weekStart.getTime() + week * WEEK_MS + dow * DAY_MS);
        startsAt.setHours(spec.timeOfDayHours, 0, 0, 0);
        if (startsAt.getTime() < nowMs()) continue;
        const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
        await prisma.session.create({
          data: {
            classTypeId: spec.classTypeId,
            trainerUserId: spec.trainerUserId,
            roomId: spec.roomId,
            startsAt,
            endsAt,
            capacity: 6,
            isActive: true,
            status: "SCHEDULED",
            recurringScheduleId: schedule.id,
          },
        });
      }
    }
  }
}

export async function seedE2E() {
  await wipe();
  const hash = await hashPassword(PASSWORD);

  const seeded = new Map<keyof typeof USERS, { user: { id: string; email: string }; clientProfileId: string | null }>();
  for (const [key, profile] of Object.entries(USERS) as Array<[
    keyof typeof USERS,
    typeof USERS[keyof typeof USERS],
  ]>) {
    const result = await seedUser(profile, hash);
    seeded.set(key, result);
  }

  const catalog = await seedCatalog();

  const clientProfiles = new Map<keyof typeof USERS, { clientProfileId: string; userId: string }>();
  for (const [key, value] of seeded.entries()) {
    if (value.clientProfileId) {
      clientProfiles.set(key, {
        clientProfileId: value.clientProfileId,
        userId: value.user.id,
      });
    }
  }
  await seedClientPackages({
    clients: clientProfiles,
    packageTypes: catalog.packageTypeByName,
  });

  await seedSessions({
    trainers: {
      reformer: { id: seeded.get("trainerReformer")!.user.id },
      energy: { id: seeded.get("trainerEnergy")!.user.id },
    },
    classTypes: catalog.classTypeByName,
    rooms: catalog.rooms.map((r) => ({ id: r.id, name: r.name })),
  });

  await seedBookings({ clients: clientProfiles });
}

/**
 * Seeds bookings on the upcoming sessions so dashboards show non-zero traffic.
 * Bookings are placed on the soonest matching session (by ClassType) for each
 * eligible client. The package-class-scoping rule means a Reformer ClientPackage
 * can only book Reformer sessions, etc.
 */
async function seedBookings(opts: {
  clients: Map<keyof typeof USERS, { clientProfileId: string; userId: string }>;
}) {
  const upcoming = await prisma.session.findMany({
    where: { startsAt: { gte: now() }, isActive: true, status: "SCHEDULED" },
    orderBy: { startsAt: "asc" },
    select: { id: true, classTypeId: true, capacity: true, startsAt: true },
  });

  const reformerSession = upcoming.find((s) => s.capacity > 0 && true);
  // Find first reformer session and first energy session by joining via ClassType.
  const reformerCt = await prisma.classType.findFirst({ where: { name: "Reformer pilates" }, select: { id: true } });
  const energyCt = await prisma.classType.findFirst({ where: { name: "Energy pilates" }, select: { id: true } });
  // Use the SECOND matching session (skip index 0) so e2e tests that book
  // "the first session of the day" still find an empty seat.
  const reformerSessions = upcoming.filter((s) => s.classTypeId === reformerCt?.id);
  const energySessions = upcoming.filter((s) => s.classTypeId === energyCt?.id);
  const firstReformer = reformerSessions[1] ?? reformerSessions[0];
  const firstEnergy = energySessions[1] ?? energySessions[0];

  // Active reformer client → second reformer session (so the day's first
  // session stays bookable for e2e specs).
  if (firstReformer) {
    const ar = opts.clients.get("activeReformer");
    if (ar) {
      const pkg = await prisma.clientPackage.findFirst({
        where: { clientProfileId: ar.clientProfileId, classTypeId: reformerCt!.id },
        select: { id: true },
      });
      if (pkg) {
        await prisma.booking.create({
          data: {
            clientProfileId: ar.clientProfileId,
            sessionId: firstReformer.id,
            clientPackageId: pkg.id,
          },
        });
      }
    }
  }

  // Active energy client → first energy session.
  if (firstEnergy) {
    const ae = opts.clients.get("activeEnergy");
    if (ae) {
      const pkg = await prisma.clientPackage.findFirst({
        where: { clientProfileId: ae.clientProfileId, classTypeId: energyCt!.id },
        select: { id: true },
      });
      if (pkg) {
        await prisma.booking.create({
          data: {
            clientProfileId: ae.clientProfileId,
            sessionId: firstEnergy.id,
            clientPackageId: pkg.id,
          },
        });
      }
    }
  }

  // Mixed cancellation states + waitlist entries — gives reports/dashboards
  // realistic data variety. Without these, the reports page shows mostly
  // green/100% and never surfaces the late-cancel or waitlist UI paths.
  const futureClient = opts.clients.get("future");
  const expiredClient = opts.clients.get("expired");
  const reformerSessionsForExtra = reformerSessions.slice(2, 6);

  // 1. Pre-cutoff cancellation — canceled comfortably before the cutoff,
  //    so no penalty (sessionsRemaining wasn't consumed).
  if (futureClient && reformerSessionsForExtra[0]) {
    const target = reformerSessionsForExtra[0];
    const cancelDays = 3;
    await prisma.booking.create({
      data: {
        clientProfileId: futureClient.clientProfileId,
        sessionId: target.id,
        clientPackageId: null,
        canceledAt: new Date(target.startsAt.getTime() - cancelDays * DAY_MS),
      },
    });
  }

  // 2. Late cancel — canceled inside the lateCancelHours window, so this
  //    one DID consume a session and surfaces the late-cancel marker.
  if (expiredClient && reformerSessionsForExtra[1]) {
    const target = reformerSessionsForExtra[1];
    await prisma.booking.create({
      data: {
        clientProfileId: expiredClient.clientProfileId,
        sessionId: target.id,
        clientPackageId: null,
        canceledAt: new Date(target.startsAt.getTime() - 2 * HOUR_MS),
      },
    });
  }

  // 3. Waitlist entry — on the same session the active reformer client is
  //    booked into. Gives the WaitlistBadge / waitlistCount > 0 path a
  //    test fixture without needing to fully fill the session.
  if (futureClient && firstReformer) {
    await prisma.waitlistEntry.create({
      data: {
        clientProfileId: futureClient.clientProfileId,
        sessionId: firstReformer.id,
        position: 1,
      },
    });
  }

  void reformerSession;
}

async function main() {
  await seedE2E();
  console.log("Phase A rich seed applied successfully.");
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error("Rich seed failed:", error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
