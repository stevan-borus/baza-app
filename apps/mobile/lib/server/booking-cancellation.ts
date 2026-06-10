/**
 * Booking-cancellation consequences: the late-cancel forfeit, the session-end
 * no-show charge, and waitlist auto-promotion. `cancellation-policy.ts`
 * decides WHETHER a cancel is late; this module owns WHAT happens next.
 */
import type { Prisma } from "@/generated/prisma";
import { shouldApplyLateCancelPenalty } from "@/lib/server/cancellation-policy";
import { findEligibleClientPackage } from "@/lib/server/package-eligibility";

/** Works with both the root PrismaClient and an interactive-tx client. */
type Db = Prisma.TransactionClient;

async function hasRecordedConsumption(
  db: Db,
  clientProfileId: string,
  sessionId: string,
) {
  const existing = await db.sessionConsumption.findUnique({
    where: { clientProfileId_sessionId: { clientProfileId, sessionId } },
    select: { id: true },
  });
  return existing !== null;
}

function recordConsumption(db: Db, clientProfileId: string, sessionId: string) {
  return db.sessionConsumption.create({
    data: { clientProfileId, sessionId },
  });
}

/** Decrements one session off the package; false if it was already empty. */
async function decrementPackageSessions(db: Db, clientPackageId: string) {
  const updated = await db.clientPackage.updateMany({
    where: { id: clientPackageId, sessionsRemaining: { gt: 0 } },
    data: { sessionsRemaining: { decrement: 1 } },
  });
  return updated.count > 0;
}

/** The package the client could spend on a session starting at `at`. */
async function resolveEligiblePackageId(
  db: Db,
  clientProfileId: string,
  classTypeId: string,
  at: Date,
) {
  const [clientPackages, packagePauses] = await Promise.all([
    db.clientPackage.findMany({
      where: { clientProfileId, classTypeId },
      select: {
        id: true,
        classTypeId: true,
        startsAt: true,
        expiresAt: true,
        sessionsRemaining: true,
      },
    }),
    db.packagePause.findMany({
      where: { clientProfileId },
      select: { startsAt: true, endsAt: true },
    }),
  ]);
  const eligiblePackage = findEligibleClientPackage(
    clientPackages,
    packagePauses,
    at,
    classTypeId,
  );
  return eligiblePackage?.id ?? null;
}

export type LateCancelForfeitInput = {
  clientProfileId: string;
  sessionId: string;
  clientPackageId: string | null;
  sessionStartsAt: Date;
  canceledAt: Date;
  lateCancelHours: number;
  waiveCharge?: boolean;
};

export type LateCancelForfeitResult = "EARLY" | "WAIVED" | "FORFEITED";

/**
 * Cancel-time forfeit: a late cancel consumes one package session.
 * Records the SessionConsumption (if not already recorded) and decrements
 * the backing package. Early cancels are free; a charge waiver skips the
 * forfeit entirely (the `waivedByUserId` stamp stays at the call site).
 */
export async function applyLateCancelForfeit(
  db: Db,
  input: LateCancelForfeitInput,
): Promise<LateCancelForfeitResult> {
  const isLate = shouldApplyLateCancelPenalty(
    input.sessionStartsAt,
    input.canceledAt,
    input.lateCancelHours,
  );
  if (!isLate) {
    return "EARLY";
  }

  // Waiver only has teeth on a package-backed late cancel — an unbacked
  // booking is already consequence-free, so it falls through unchanged.
  if (input.waiveCharge && input.clientPackageId) {
    return "WAIVED";
  }

  const alreadyRecorded = await hasRecordedConsumption(
    db,
    input.clientProfileId,
    input.sessionId,
  );
  if (!alreadyRecorded) {
    await recordConsumption(db, input.clientProfileId, input.sessionId);
  }

  if (input.clientPackageId) {
    await decrementPackageSessions(db, input.clientPackageId);
  }
  return "FORFEITED";
}

export type NoShowChargeInput = {
  clientProfileId: string;
  sessionId: string;
  clientPackageId: string | null;
  sessionStartsAt: Date;
  sessionClassTypeId: string;
};

export type NoShowChargeOutcome = "CONSUMED" | "NO_PACKAGE" | "ALREADY_CONSUMED";

/**
 * Session-end no-show charge (cron): an uncancelled booking at session-end IS
 * a consumed booking. Unbacked bookings (admin reservations) get late-bound
 * to an eligible package. Unlike the cancel-time forfeit, the consumption is
 * only recorded when a package was actually decremented — an empty or missing
 * package is reported as NO_PACKAGE so admins hear about unbacked attendance.
 *
 * Must run inside a transaction; a unique-constraint violation on the
 * consumption insert (concurrent cron run) propagates to the caller.
 */
export async function chargeNoShowConsumption(
  tx: Db,
  input: NoShowChargeInput,
): Promise<NoShowChargeOutcome> {
  if (await hasRecordedConsumption(tx, input.clientProfileId, input.sessionId)) {
    return "ALREADY_CONSUMED";
  }

  // Unbacked admin reservation: late-bind to whichever package would have
  // been eligible at the session's start.
  const targetPackageId =
    input.clientPackageId ??
    (await resolveEligiblePackageId(
      tx,
      input.clientProfileId,
      input.sessionClassTypeId,
      input.sessionStartsAt,
    ));
  if (!targetPackageId) {
    return "NO_PACKAGE";
  }

  const decremented = await decrementPackageSessions(tx, targetPackageId);
  if (!decremented) {
    return "NO_PACKAGE";
  }

  await recordConsumption(tx, input.clientProfileId, input.sessionId);
  return "CONSUMED";
}

/**
 * Promotes the next waitlisted client (by position, then createdAt) on a
 * session into a booking backed by their eligible package, then recompacts
 * the remaining positions. Returns the promoted client's userId, or null if
 * nobody was promoted. Runs on the caller's transaction client so a cancel
 * endpoint can make the promotion atomic with whatever shape it needs.
 */
export async function promoteNextWaitlistEntry(
  tx: Db,
  sessionId: string,
): Promise<string | null> {
  const session = await tx.session.findUnique({
    where: { id: sessionId },
    select: { id: true, startsAt: true, classTypeId: true },
  });
  if (!session) return null;

  const next = await tx.waitlistEntry.findFirst({
    where: { sessionId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, clientProfileId: true },
  });
  if (!next) return null;

  await tx.waitlistEntry.delete({ where: { id: next.id } });

  const eligiblePackageId = await resolveEligiblePackageId(
    tx,
    next.clientProfileId,
    session.classTypeId,
    session.startsAt,
  );
  if (!eligiblePackageId) return null;

  await tx.booking.upsert({
    where: {
      sessionId_clientProfileId: {
        sessionId,
        clientProfileId: next.clientProfileId,
      },
    },
    create: {
      sessionId,
      clientProfileId: next.clientProfileId,
      clientPackageId: eligiblePackageId,
    },
    update: { canceledAt: null, clientPackageId: eligiblePackageId },
  });

  // Recompact positions so the next promotion picks the correct client.
  const remainingWaitlist = await tx.waitlistEntry.findMany({
    where: { sessionId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  await Promise.all(
    remainingWaitlist.map((entry, index) =>
      tx.waitlistEntry.update({
        where: { id: entry.id },
        data: { position: index + 1 },
      }),
    ),
  );

  const promotedClient = await tx.clientProfile.findUnique({
    where: { id: next.clientProfileId },
    select: { userId: true },
  });
  return promotedClient?.userId ?? null;
}
