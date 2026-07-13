// POST /api/packages/client-packages/[id]/revoke — keep-the-trace revoke.
//
// Product decision: when a pay-later client never shows up to pay, the admin
// pulls the package back WITHOUT erasing history. In one transaction:
//
//   1. ClientPackage.revokedAt = now()   — the row stays, rights stop.
//   2. All FUTURE bookings backed by this package are canceled (canceledAt
//      stamp). NO late-cancel forfeit applies — revocation is an admin
//      action, not a client cancellation, and the package is dead anyway.
//      PAST bookings/attendance stay untouched ("attended N, never paid").
//   3. Waitlist entries the schema can't tie to a package directly (they
//      carry no clientPackageId) are released only when NO other live
//      package of the same class type would back them at their session's
//      start — same class-type-scoped model booking-hold-count uses.
//   4. The funding BillingRecord (clientPackageId FK) flips to VOIDED but
//      keeps its row: Naplata still shows the amount, struck through.
//
// sessionsRemaining is deliberately NOT refunded for the canceled future
// bookings — the counter freezes as the trace of how much was actually used.
import { revokeClientPackageResponseSchema } from "@baza/types/packages";
import { UserRole } from "@/generated/prisma";
import { now } from "@/lib/now";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, respond } from "@/lib/server/http";
import { findEligibleClientPackage } from "@/lib/server/package-eligibility";
import { prisma } from "@/lib/server/prisma";

type RouteParams = Record<string, string>;

export async function POST(request: Request, { id }: RouteParams) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const pkg = await prisma.clientPackage.findUnique({
    where: { id },
    select: {
      id: true,
      clientProfileId: true,
      classTypeId: true,
      revokedAt: true,
    },
  });
  if (!pkg) return fail("Client package not found", 404);
  if (pkg.revokedAt) return fail("Package is already revoked", 409);

  const revokedAt = now();

  const result = await prisma.$transaction(async (tx) => {
    // Atomic claim (same pattern as campaign dispatch's DRAFT→SENDING):
    // `where revokedAt: null` makes a concurrent double-revoke a no-op for
    // the loser instead of double-canceling bookings.
    const claimed = await tx.clientPackage.updateMany({
      where: { id: pkg.id, revokedAt: null },
      data: { revokedAt },
    });
    if (claimed.count === 0) {
      return { alreadyRevoked: true as const };
    }

    const canceledFutureBookings = await tx.booking.updateMany({
      where: {
        clientPackageId: pkg.id,
        canceledAt: null,
        session: { startsAt: { gt: revokedAt } },
      },
      data: { canceledAt: revokedAt },
    });

    // Release the client's waitlist seats for future sessions of this class
    // type — unless another live package would still back them. Eligibility
    // is checked per entry at the session's start instant with the same
    // pure helper booking uses, so the decision can't drift from booking.
    const waitlistEntries = await tx.waitlistEntry.findMany({
      where: {
        clientProfileId: pkg.clientProfileId,
        session: {
          classTypeId: pkg.classTypeId,
          startsAt: { gt: revokedAt },
        },
      },
      select: {
        id: true,
        session: { select: { startsAt: true, classTypeId: true } },
      },
    });

    let removedWaitlistEntries = 0;
    if (waitlistEntries.length > 0) {
      const [otherPackages, pauses] = await Promise.all([
        tx.clientPackage.findMany({
          where: {
            clientProfileId: pkg.clientProfileId,
            classTypeId: pkg.classTypeId,
            id: { not: pkg.id },
          },
          select: {
            id: true,
            classTypeId: true,
            startsAt: true,
            expiresAt: true,
            sessionsRemaining: true,
            revokedAt: true,
          },
        }),
        tx.packagePause.findMany({
          where: { clientProfileId: pkg.clientProfileId },
          select: { startsAt: true, endsAt: true },
        }),
      ]);
      const unbackedIds = waitlistEntries
        .filter(
          (entry) =>
            !findEligibleClientPackage(
              otherPackages,
              pauses,
              entry.session.startsAt,
              entry.session.classTypeId,
            ),
        )
        .map((entry) => entry.id);
      if (unbackedIds.length > 0) {
        const deleted = await tx.waitlistEntry.deleteMany({
          where: { id: { in: unbackedIds } },
        });
        removedWaitlistEntries = deleted.count;
      }
    }

    const voided = await tx.billingRecord.updateMany({
      where: { clientPackageId: pkg.id },
      data: { status: "VOIDED" },
    });

    return {
      alreadyRevoked: false as const,
      canceledFutureBookings: canceledFutureBookings.count,
      removedWaitlistEntries,
      billingRecordVoided: voided.count > 0,
    };
  });

  if (result.alreadyRevoked) {
    return fail("Package is already revoked", 409);
  }

  return respond(revokeClientPackageResponseSchema, {
    success: true,
    clientPackage: { id: pkg.id, revokedAt: revokedAt.toISOString() },
    canceledFutureBookings: result.canceledFutureBookings,
    removedWaitlistEntries: result.removedWaitlistEntries,
    billingRecordVoided: result.billingRecordVoided,
  });
}
