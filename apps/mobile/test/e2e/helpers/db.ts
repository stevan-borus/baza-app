/**
 * Helpers for E2E specs to talk to the test DB directly.
 *
 * - `resetAndSeed()` re-applies the rich seed (Q2(b) in the test plan).
 * - `createInvite()` / `createPasswordResetToken()` insert tokens with both
 *   the raw value (returned to the spec) and the hash the API expects to
 *   match on. The production code only stores hashes, so a spec that needs
 *   to "act on" a token must create it via these helpers.
 * - `getInvite()` / `getResetToken()` read back rows for assertions.
 */
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../generated/prisma";
import { now, nowMs } from "../../../lib/now";

const APP_DIR = path.resolve(__dirname, "../../..");
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5434/baza_app?schema=public";

let prismaClient: PrismaClient | null = null;
let prismaPool: Pool | null = null;
function db(): PrismaClient {
  if (!prismaClient) {
    prismaPool = new Pool({ connectionString: DATABASE_URL });
    const adapter = new PrismaPg(prismaPool);
    prismaClient = new PrismaClient({ adapter });
  }
  return prismaClient;
}

function hashToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

function generateRawToken() {
  return randomBytes(32).toString("hex");
}

export async function resetAndSeed() {
  execFileSync("pnpm", ["exec", "tsx", "scripts/test/seed-e2e.ts"], {
    cwd: APP_DIR,
    env: { ...process.env, DATABASE_URL },
    stdio: "inherit",
  });
}

type CreateInviteInput = {
  email: string;
  fullName: string;
  expiresAt?: Date;
  status?: "PENDING" | "COMPLETED" | "EXPIRED" | "REVOKED";
};

/**
 * Create an invite with a known raw token. The raw token is returned so the
 * spec can put it in `/accept-invite?token=...`. Does NOT send an email.
 */
export async function createInvite(input: CreateInviteInput) {
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt =
    input.expiresAt ?? new Date(nowMs() + 24 * 60 * 60 * 1000);
  const invite = await db().userInvite.create({
    data: {
      email: input.email.toLowerCase(),
      fullName: input.fullName,
      role: "CLIENT",
      tokenHash,
      status: input.status ?? "PENDING",
      expiresAt,
    },
  });
  return { id: invite.id, rawToken };
}

export async function getInvite(id: string) {
  return db().userInvite.findUnique({ where: { id } });
}

export async function findInviteByEmail(email: string) {
  return db().userInvite.findFirst({
    where: { email: email.toLowerCase() },
    orderBy: { createdAt: "desc" },
  });
}

type CreateResetTokenInput = {
  userEmail: string;
  expiresAt?: Date;
  usedAt?: Date | null;
};

/**
 * Create a PasswordResetToken with a known raw value.
 */
export async function createPasswordResetToken(input: CreateResetTokenInput) {
  const user = await db().user.findUnique({
    where: { email: input.userEmail.toLowerCase() },
    select: { id: true },
  });
  if (!user) {
    throw new Error(`User not found: ${input.userEmail}`);
  }
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const row = await db().passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: input.expiresAt ?? new Date(nowMs() + 30 * 60 * 1000),
      usedAt: input.usedAt ?? null,
    },
  });
  return { id: row.id, rawToken };
}

/**
 * Create a Booking directly so a trainer-client linkage exists for E2E.
 * Returns the booking id and the chosen sessionId. Picks the soonest
 * future session for the trainer; throws if none.
 */
export async function linkTrainerToClient(
  trainerEmail: string,
  clientEmail: string,
) {
  const [trainer, clientUser] = await Promise.all([
    db().user.findUnique({
      where: { email: trainerEmail.toLowerCase() },
      select: { id: true },
    }),
    db().user.findUnique({
      where: { email: clientEmail.toLowerCase() },
      select: { clientProfile: { select: { id: true } } },
    }),
  ]);
  if (!trainer || !clientUser?.clientProfile) {
    throw new Error("Trainer or client not found");
  }
  const session = await db().session.findFirst({
    where: {
      trainerUserId: trainer.id,
      startsAt: { gt: now() },
      status: "SCHEDULED",
    },
    orderBy: { startsAt: "asc" },
    select: { id: true },
  });
  if (!session) throw new Error("No future session for trainer");
  const booking = await db().booking.upsert({
    where: {
      sessionId_clientProfileId: {
        sessionId: session.id,
        clientProfileId: clientUser.clientProfile.id,
      },
    },
    create: {
      sessionId: session.id,
      clientProfileId: clientUser.clientProfile.id,
    },
    update: { canceledAt: null },
    select: { id: true },
  });
  return { bookingId: booking.id, sessionId: session.id };
}

type CreatePastSessionInput = {
  trainerEmail: string;
  classTypeName: string;
  clientEmail: string;
  /** Session's startsAt; endsAt is +60min. Must be in the past. */
  startsAt: Date;
  /** Cancel the booking before/after the late-cancel cutoff, or not at all. */
  cancel?: "none" | "before-cutoff" | "after-cutoff";
};

/**
 * Backdate a session-with-booking so the consumption cron has something
 * to chew on. Returns the row IDs and the client's clientPackage.id so
 * the spec can read sessionsRemaining before/after the cron run.
 */
export async function createPastSessionWithBooking(input: CreatePastSessionInput) {
  const [trainer, classType, clientUser] = await Promise.all([
    db().user.findUnique({
      where: { email: input.trainerEmail.toLowerCase() },
      select: { id: true },
    }),
    db().classType.findFirst({
      where: { name: input.classTypeName },
      select: { id: true },
    }),
    db().user.findUnique({
      where: { email: input.clientEmail.toLowerCase() },
      select: {
        clientProfile: {
          select: {
            id: true,
            packages: {
              where: { classTypeId: undefined },
              select: { id: true, classTypeId: true },
            },
          },
        },
      },
    }),
  ]);
  if (!trainer || !classType || !clientUser?.clientProfile) {
    throw new Error("Trainer/classType/client not found");
  }
  const room = await db().studioRoom.findFirst({ select: { id: true } });
  if (!room) throw new Error("No StudioRoom");

  const endsAt = new Date(input.startsAt.getTime() + 60 * 60 * 1000);
  const session = await db().session.create({
    data: {
      classTypeId: classType.id,
      trainerUserId: trainer.id,
      roomId: room.id,
      startsAt: input.startsAt,
      endsAt,
      capacity: 6,
      status: "SCHEDULED",
    },
    select: { id: true },
  });

  // Pick the client's package matching this classType.
  const pkg = await db().clientPackage.findFirst({
    where: {
      clientProfileId: clientUser.clientProfile.id,
      classTypeId: classType.id,
    },
    select: { id: true, sessionsRemaining: true, lateCancelHours: true },
  });
  if (!pkg) {
    throw new Error("Client has no package for this class type");
  }

  const cancel = input.cancel ?? "none";
  // Late-cancel boundary: if cancellation < lateCancelHours before startsAt,
  // it's "after-cutoff". `before-cutoff` means cancellation more than
  // lateCancelHours before startsAt.
  const cutoffMs = pkg.lateCancelHours * 60 * 60 * 1000;
  const canceledAt =
    cancel === "before-cutoff"
      ? new Date(input.startsAt.getTime() - cutoffMs - 60 * 60 * 1000)
      : cancel === "after-cutoff"
        ? new Date(input.startsAt.getTime() - 60 * 60 * 1000)
        : null;

  const booking = await db().booking.create({
    data: {
      sessionId: session.id,
      clientProfileId: clientUser.clientProfile.id,
      clientPackageId: pkg.id,
      canceledAt,
    },
    select: { id: true },
  });

  return {
    sessionId: session.id,
    bookingId: booking.id,
    clientPackageId: pkg.id,
    sessionsRemainingBefore: pkg.sessionsRemaining,
  };
}

export async function getUserActive(userEmail: string) {
  const user = await db().user.findUnique({
    where: { email: userEmail.toLowerCase() },
    select: { isActive: true },
  });
  return user?.isActive ?? null;
}

export async function getUserIdByEmail(userEmail: string) {
  const user = await db().user.findUnique({
    where: { email: userEmail.toLowerCase() },
    select: { id: true },
  });
  if (!user) throw new Error(`No user with email ${userEmail}`);
  return user.id;
}

export async function countSessionsByStatus(status: "SCHEDULED" | "CANCELED" | "COMPLETED") {
  return db().session.count({ where: { status } });
}

export async function countRecurringSchedules() {
  return db().recurringSchedule.count();
}

export async function findFutureSeriesSession(scheduleNamePart: string) {
  // Find a future session whose recurringSchedule's class type contains the
  // given name fragment. Useful when the spec doesn't know the schedule ID
  // ahead of time.
  return db().session.findFirst({
    where: {
      startsAt: { gt: now() },
      status: "SCHEDULED",
      recurringScheduleId: { not: null },
      classType: { name: { contains: scheduleNamePart } },
    },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      recurringScheduleId: true,
      startsAt: true,
      classType: { select: { name: true } },
    },
  });
}

/**
 * Cancel every live (canceledAt = null) booking on a recurring schedule's
 * future sessions. The series PATCH/DELETE handlers refuse to operate when
 * any future session has bookings (see app/api/sessions/recurring/[id]/+api.ts);
 * the rich seed places one booking on each schedule so dashboards aren't
 * empty, so series-edit specs need to clear those bookings first.
 *
 * Returns the number of bookings canceled (mostly for sanity).
 */
export async function cancelBookingsOnRecurringSchedule(
  recurringScheduleId: string,
) {
  const result = await db().booking.updateMany({
    where: {
      canceledAt: null,
      session: {
        recurringScheduleId,
        startsAt: { gte: now() },
      },
    },
    data: { canceledAt: now() },
  });
  return result.count;
}

/**
 * Schedule a future session for a given trainer + class type, starting in
 * `hoursFromNow` hours. Useful when the rich seed's earliest session is
 * outside the late-cancel cutoff.
 */
export async function createFutureSession(input: {
  trainerEmail: string;
  classTypeName: string;
  hoursFromNow: number;
  capacity?: number;
}) {
  const trainer = await db().user.findUnique({
    where: { email: input.trainerEmail.toLowerCase() },
    select: { id: true },
  });
  const classType = await db().classType.findFirst({
    where: { name: input.classTypeName },
    select: { id: true },
  });
  const room = await db().studioRoom.findFirst({ select: { id: true } });
  if (!trainer || !classType || !room) {
    throw new Error("Trainer / classType / room not found");
  }
  const startsAt = new Date(nowMs() + input.hoursFromNow * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
  const session = await db().session.create({
    data: {
      classTypeId: classType.id,
      trainerUserId: trainer.id,
      roomId: room.id,
      startsAt,
      endsAt,
      capacity: input.capacity ?? 6,
      status: "SCHEDULED",
    },
    select: { id: true, startsAt: true, capacity: true, classTypeId: true },
  });
  return session;
}

/**
 * Pre-fill a session with bookings from any clients except `excludeEmail`,
 * up to its `capacity`. Each filler booking is tied to a synthetic
 * ClientProfile (so the seeded matrix isn't perturbed).
 */
export async function fillSessionToCapacity(
  sessionId: string,
  excludeEmail: string,
) {
  const session = await db().session.findUnique({
    where: { id: sessionId },
    select: { capacity: true, classTypeId: true },
  });
  if (!session) throw new Error("Session not found");
  const exclude = await db().user.findUnique({
    where: { email: excludeEmail.toLowerCase() },
    select: { clientProfile: { select: { id: true } } },
  });
  const excludeId = exclude?.clientProfile?.id ?? null;

  const existing = await db().booking.count({
    where: { sessionId, canceledAt: null },
  });
  const toFill = session.capacity - existing;
  if (toFill <= 0) return { added: 0 };

  // Create synthetic clients to occupy the seats.
  const fillers: { id: string }[] = [];
  for (let i = 0; i < toFill; i++) {
    const email = `filler.${sessionId.slice(0, 8)}.${i}@e2e.test`;
    const user = await db().user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        fullName: `Filler ${i}`,
        role: "CLIENT",
        isActive: true,
        passwordHash: "$2b$10$placeholder",
        clientProfile: { create: {} },
      },
      select: { clientProfile: { select: { id: true } } },
    });
    if (user.clientProfile && user.clientProfile.id !== excludeId) {
      fillers.push({ id: user.clientProfile.id });
    }
  }

  for (const f of fillers) {
    await db().booking.create({
      data: {
        sessionId,
        clientProfileId: f.id,
      },
    });
  }
  return { added: fillers.length };
}

/**
 * Add a client to the waitlist for a session at a given position.
 */
export async function addToWaitlist(
  sessionId: string,
  clientEmail: string,
  position: number,
) {
  const user = await db().user.findUnique({
    where: { email: clientEmail.toLowerCase() },
    select: { clientProfile: { select: { id: true } } },
  });
  if (!user?.clientProfile) throw new Error("Client not found");
  return db().waitlistEntry.create({
    data: {
      sessionId,
      clientProfileId: user.clientProfile.id,
      position,
    },
  });
}

export async function findClientBookingFor(
  clientEmail: string,
  sessionId: string,
) {
  const user = await db().user.findUnique({
    where: { email: clientEmail.toLowerCase() },
    select: { clientProfile: { select: { id: true } } },
  });
  if (!user?.clientProfile) return null;
  return db().booking.findFirst({
    where: {
      sessionId,
      clientProfileId: user.clientProfile.id,
      canceledAt: null,
    },
    select: { id: true, clientPackageId: true },
  });
}

export async function findSessionConsumption(
  clientEmail: string,
  sessionId: string,
) {
  const user = await db().user.findUnique({
    where: { email: clientEmail.toLowerCase() },
    select: { clientProfile: { select: { id: true } } },
  });
  if (!user?.clientProfile) return null;
  return db().sessionConsumption.findUnique({
    where: {
      clientProfileId_sessionId: {
        clientProfileId: user.clientProfile.id,
        sessionId,
      },
    },
    select: { id: true },
  });
}

export async function countSessions() {
  return db().session.count();
}

export async function findSessionByStartsAt(startsAt: Date) {
  return db().session.findFirst({
    where: {
      startsAt: {
        gte: new Date(startsAt.getTime() - 60_000),
        lte: new Date(startsAt.getTime() + 60_000),
      },
    },
    select: {
      id: true,
      startsAt: true,
      capacity: true,
      classTypeId: true,
      trainerUserId: true,
      roomId: true,
    },
  });
}

export async function getSessionsRemaining(clientPackageId: string) {
  const pkg = await db().clientPackage.findUnique({
    where: { id: clientPackageId },
    select: { sessionsRemaining: true },
  });
  return pkg?.sessionsRemaining ?? null;
}

export async function countActiveBookingsFor(userEmail: string) {
  const user = await db().user.findUnique({
    where: { email: userEmail.toLowerCase() },
    select: { clientProfile: { select: { id: true } } },
  });
  if (!user?.clientProfile) return 0;
  return db().booking.count({
    where: {
      clientProfileId: user.clientProfile.id,
      canceledAt: null,
    },
  });
}

export async function countTrainerNotesFor(clientEmail: string) {
  const user = await db().user.findUnique({
    where: { email: clientEmail.toLowerCase() },
    select: { clientProfile: { select: { id: true } } },
  });
  if (!user?.clientProfile) return 0;
  return db().trainerNote.count({
    where: { clientProfileId: user.clientProfile.id },
  });
}

export async function findLatestResetTokenFor(userEmail: string) {
  const user = await db().user.findUnique({
    where: { email: userEmail.toLowerCase() },
    select: { id: true },
  });
  if (!user) return null;
  return db().passwordResetToken.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Build a past session with one consumed booking + one canceled booking, so
 * the trainer schedule has post-cron attendance markers to render. Returns
 * the session id and the YYYY-MM-DD key for the day the spec should
 * navigate to.
 */
export async function createPastAttendedSession(input: {
  trainerEmail: string;
  classTypeName: string;
  consumedClientEmail: string;
  canceledClientEmail: string;
  startsAt: Date;
}) {
  const [trainer, classType, consumedUser, canceledUser, room] =
    await Promise.all([
      db().user.findUnique({
        where: { email: input.trainerEmail.toLowerCase() },
        select: { id: true },
      }),
      db().classType.findFirst({
        where: { name: input.classTypeName },
        select: { id: true },
      }),
      db().user.findUnique({
        where: { email: input.consumedClientEmail.toLowerCase() },
        select: { clientProfile: { select: { id: true } } },
      }),
      db().user.findUnique({
        where: { email: input.canceledClientEmail.toLowerCase() },
        select: { clientProfile: { select: { id: true } } },
      }),
      db().studioRoom.findFirst({ select: { id: true } }),
    ]);
  if (
    !trainer ||
    !classType ||
    !consumedUser?.clientProfile ||
    !canceledUser?.clientProfile ||
    !room
  ) {
    throw new Error("Missing seed entities for past attended session");
  }

  const endsAt = new Date(input.startsAt.getTime() + 60 * 60 * 1000);
  const session = await db().session.create({
    data: {
      classTypeId: classType.id,
      trainerUserId: trainer.id,
      roomId: room.id,
      startsAt: input.startsAt,
      endsAt,
      capacity: 6,
      status: "SCHEDULED",
    },
    select: { id: true },
  });

  // Consumed booking: active, has SessionConsumption row.
  await db().booking.create({
    data: {
      sessionId: session.id,
      clientProfileId: consumedUser.clientProfile.id,
    },
  });
  await db().sessionConsumption.create({
    data: {
      sessionId: session.id,
      clientProfileId: consumedUser.clientProfile.id,
    },
  });

  // Canceled booking: canceledAt set, no SessionConsumption row.
  await db().booking.create({
    data: {
      sessionId: session.id,
      clientProfileId: canceledUser.clientProfile.id,
      canceledAt: new Date(input.startsAt.getTime() - 30 * 60 * 1000),
    },
  });

  const yyyy = input.startsAt.getFullYear();
  const mm = String(input.startsAt.getMonth() + 1).padStart(2, "0");
  const dd = String(input.startsAt.getDate()).padStart(2, "0");
  return { sessionId: session.id, dateKey: `${yyyy}-${mm}-${dd}` };
}

/**
 * Insert N additional CLIENT users (with attached ClientProfile) on top of
 * whatever the rich seed already produced. Used by pagination specs that
 * need more than the seed's six clients. Names are deterministic for
 * stable assertions: "Pagi Client {idx}".
 */
export async function seedExtraClients(count: number) {
  const created: { userId: string; profileId: string; fullName: string }[] = [];
  for (let i = 0; i < count; i++) {
    const idx = String(i + 1).padStart(3, "0");
    const email = `pagi-client-${idx}@e2e.test`;
    const user = await db().user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        fullName: `Pagi Client ${idx}`,
        role: "CLIENT",
        isActive: true,
        passwordHash: "$2b$10$placeholder",
        clientProfile: { create: {} },
      },
      select: {
        id: true,
        fullName: true,
        clientProfile: { select: { id: true } },
      },
    });
    if (user.clientProfile) {
      created.push({
        userId: user.id,
        profileId: user.clientProfile.id,
        fullName: user.fullName,
      });
    }
  }
  return created;
}

/**
 * Insert N additional ClientPackages on top of whatever the rich seed already
 * produced. Reuses `seedExtraClients` to mint fresh ClientProfile parents so
 * we don't perturb the seeded matrix, then attaches each to the first
 * available PackageType + ClassType. Used by the active-assignments
 * pagination spec — the rich seed only produces a handful of ClientPackages
 * so we need to push past the default page size of 20.
 */
export async function seedExtraClientPackages(count: number) {
  const profiles = await seedExtraClients(count);
  const packageType = await db().packageType.findFirst({
    select: { id: true, classTypeId: true, sessionCount: true, validityDays: true, lateCancelHours: true },
  });
  if (!packageType) throw new Error("No PackageType in seed");
  const startsAt = now();
  const expiresAt = new Date(
    startsAt.getTime() + packageType.validityDays * 24 * 60 * 60 * 1000,
  );
  const created: { id: string; clientProfileId: string }[] = [];
  for (const p of profiles) {
    const pkg = await db().clientPackage.create({
      data: {
        clientProfileId: p.profileId,
        packageTypeId: packageType.id,
        classTypeId: packageType.classTypeId,
        lateCancelHours: packageType.lateCancelHours,
        startsAt,
        expiresAt,
        sessionsRemaining: packageType.sessionCount,
      },
      select: { id: true, clientProfileId: true },
    });
    created.push(pkg);
  }
  return created;
}

export async function disconnect() {
  if (prismaClient) {
    await prismaClient.$disconnect();
    prismaClient = null;
  }
  if (prismaPool) {
    await prismaPool.end();
    prismaPool = null;
  }
}
