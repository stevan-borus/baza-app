// POST /api/bookings/[id]/confirm-trial — value a trial (probni) attendance.
//
// An admin reservation books a visitor with no package, so the session-end
// cron writes no payroll snapshot for them (NO_PACKAGE) and the trainer's
// report shows an unpriced line. Nothing here is automatic on purpose: a trial
// no-show is not work the studio pays for, so only an admin confirming the
// person actually came freezes a value.
//
// The value comes from the class type (`trialSessionValue`), not from any
// package. Frozen exactly like a package-backed attendance — the snapshot is a
// fact about work already done, so later editing the class type's trial value
// must not rewrite a month that has been paid.
import { formatFullName } from "@baza/types/common";
import { confirmTrialResponseSchema } from "@baza/types/payroll";
import { UserRole } from "@/generated/prisma";
import { now } from "@/lib/now";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, respond } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { tryCatch } from "@/lib/server/try-catch";

type RouteParams = Record<string, string>;

function isUniqueConstraintError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  return "code" in error && (error as { code?: string }).code === "P2002";
}

export async function POST(request: Request, { id }: RouteParams) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const booking = await prisma.booking.findUnique({
    where: { id },
    select: {
      clientProfileId: true,
      sessionId: true,
      clientPackageId: true,
      canceledAt: true,
      clientProfile: {
        select: { user: { select: { firstName: true, lastName: true } } },
      },
      session: {
        select: {
          endsAt: true,
          status: true,
          classType: { select: { trialSessionValue: true } },
        },
      },
    },
  });
  if (!booking) return fail("Booking not found", 404);

  if (booking.canceledAt) return fail("Booking is canceled", 400);
  // Only an unbacked attendance is a trial. A package-backed one is already
  // valued by the cron against the package the client paid for.
  if (booking.clientPackageId) {
    return fail("Booking is backed by a package", 400);
  }
  if (booking.session.status === "CANCELED") {
    return fail("Session is canceled", 400);
  }
  if (booking.session.endsAt > now()) {
    return fail("Session has not ended yet", 400);
  }

  const trialSessionValue = booking.session.classType.trialSessionValue;
  if (trialSessionValue === null) {
    return fail("Trial value is not set for this class type", 409);
  }

  const existing = await prisma.sessionConsumption.findFirst({
    where: {
      clientProfileId: booking.clientProfileId,
      sessionId: booking.sessionId,
    },
    select: { id: true },
  });
  if (existing) return fail("Attendance already recorded", 409);

  // The pre-check above is the readable path; the unique constraint is what
  // actually settles a race between two admins confirming the same visitor.
  const created = await tryCatch(
    prisma.sessionConsumption.create({
      data: {
        clientProfileId: booking.clientProfileId,
        sessionId: booking.sessionId,
        consumedAt: now(),
        sessionValue: trialSessionValue,
        clientName: formatFullName(
          booking.clientProfile.user.firstName,
          booking.clientProfile.user.lastName,
        ),
        packageName: null,
        isGift: false,
        isTrial: true,
      },
      select: { isTrial: true },
    }),
  );
  if (created.error) {
    if (isUniqueConstraintError(created.error)) {
      return fail("Attendance already recorded", 409);
    }
    throw created.error;
  }

  return respond(confirmTrialResponseSchema, {
    success: true,
    consumption: {
      sessionId: booking.sessionId,
      clientProfileId: booking.clientProfileId,
      sessionValue: trialSessionValue,
      isTrial: created.data.isTrial,
    },
  });
}
