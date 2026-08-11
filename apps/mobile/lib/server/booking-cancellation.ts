/**
 * Booking-cancellation consequences: the late-cancel forfeit, the session-end
 * no-show charge, and waitlist auto-promotion. `cancellation-policy.ts`
 * decides WHETHER a cancel is late; this module owns WHAT happens next.
 */
import { formatFullName } from "@baza/types/common";
import type { Prisma } from "@/generated/prisma";
import { shouldApplyLateCancelPenalty } from "@/lib/server/cancellation-policy";
import {
  ELIGIBILITY_PACKAGE_SELECT,
  findEligibleClientPackage,
  toEligibilityPackage,
} from "@/lib/server/package-eligibility";

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

/**
 * Record the attendance AND freeze what it is worth to the trainer.
 *
 * The value and the display names are copied here rather than joined at read
 * time: a payout is a fact about work already done, so a later price edit,
 * package revoke or client deletion must not be able to rewrite it. This is
 * the only place a consumption row is created, so it is the only place the
 * snapshot has to be taken.
 *
 * `clientPackageId` is the package actually charged — null for an unbacked
 * attendance, which leaves `sessionValue` null so the report can flag it
 * instead of silently counting zero.
 */
async function recordConsumption(
  db: Db,
  clientProfileId: string,
  sessionId: string,
  clientPackageId: string | null,
) {
  const [profile, pkg] = await Promise.all([
    db.clientProfile.findUnique({
      where: { id: clientProfileId },
      select: { user: { select: { firstName: true, lastName: true } } },
    }),
    clientPackageId
      ? db.clientPackage.findUnique({
          where: { id: clientPackageId },
          select: {
            sessionsGranted: true,
            bonusSessions: true,
            isGift: true,
            packageType: {
              select: { name: true, price: true, sessionCount: true },
            },
          },
        })
      : Promise.resolve(null),
  ]);

  // The rate is what ONE training on this package costs, so the price is
  // always spread over the SKU's own session count — never over what a
  // particular package handed out. A gift grants a single session of a real
  // 12-session package: it is worth 15000/12, not the whole 15000.
  //
  // A "+1 termin" grant is the one thing that legitimately changes the
  // divisor, because it grows the package the client actually bought.
  const total = pkg
    ? pkg.isGift
      ? pkg.packageType.sessionCount
      : pkg.sessionsGranted + pkg.bonusSessions
    : 0;
  const price = pkg?.packageType.price ?? null;

  return db.sessionConsumption.create({
    data: {
      clientProfileId,
      sessionId,
      sessionValue:
        price === null || total <= 0 ? null : Math.round(price / total),
      clientName: profile
        ? formatFullName(profile.user.firstName, profile.user.lastName)
        : "—",
      packageName: pkg?.packageType.name ?? null,
      isGift: pkg?.isGift ?? false,
    },
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
      where: { clientProfileId, classTypes: { some: { classTypeId } } },
      select: ELIGIBILITY_PACKAGE_SELECT,
    }),
    db.packagePause.findMany({
      where: { clientProfileId },
      select: { startsAt: true, endsAt: true },
    }),
  ]);
  const eligiblePackage = findEligibleClientPackage(
    clientPackages.map(toEligibilityPackage),
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
    await recordConsumption(
      db,
      input.clientProfileId,
      input.sessionId,
      input.clientPackageId,
    );
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

  await recordConsumption(tx, input.clientProfileId, input.sessionId, targetPackageId);
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
