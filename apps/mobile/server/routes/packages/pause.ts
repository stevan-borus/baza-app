// POST /api/packages/pause — freeze the client's membership for a window.
//
// Product decision: a pause is an ADMINISTRATIVE freeze, not the client
// backing out of individual classes. Creating one used to insert a row and
// nothing else, which left the client's reserved sessions occupying capacity,
// still on the trainer roster, and still charged against the package by the
// session-end no-show path. In one transaction it now:
//
//   1. Cancels every one of the client's non-cancelled bookings for sessions
//      starting inside [startsAt, endsAt) that have not started yet. NO
//      late-cancel forfeit, ever — the studio froze the membership, so
//      nothing is consumed and no SessionConsumption row is written, however
//      close the class was. A session inside the window that ALREADY started
//      is left alone: its attendance is history.
//   2. Releases the client's waitlist entries in the same window. Unlike
//      revoke, this is not scoped to a class type or checked against another
//      backing package — a PackagePause is per-CLIENT, so the client is
//      paused for everything.
//   3. Pushes each still-live package's expiresAt forward by the pause length
//      and records the grant (see lib/server/package-pause.ts). Written to
//      the COLUMN so the clients-list chip, the client detail header, the
//      expiry cron and the client's package timeline all agree with what
//      booking eligibility believes.
//
// Overlapping pauses for the same client are a 409: two overlapping windows
// would each credit their full length and hand the client the overlap twice.
//
// After the transaction commits, each session freed by a cancelled booking
// promotes its next waitlisted client — post-commit, one transaction per
// session, exactly like revoke — and the paused client is notified.
import { NOTIFICATION_MESSAGE_KEYS } from "@baza/i18n";
import {
  packagePauseInputSchema,
  packagePauseResponseSchema,
} from "@baza/types/packages";
import { UserRole } from "@/generated/prisma";
import { now } from "@/lib/now";
import { requireRole } from "@/lib/server/auth-guards";
import { promoteNextWaitlistEntry } from "@/lib/server/booking-cancellation";
import { respond, fail, parseBody } from "@/lib/server/http";
import { createSystemNotification } from "@/lib/server/notifications";
import {
  extendPackagesForPause,
  findPackagesExtendableByPause,
} from "@/lib/server/package-pause";
import { prisma } from "@/lib/server/prisma";
import { trainerLinkedToClientProfile } from "@/lib/server/trainer-scope";
import { tryCatch } from "@/lib/server/try-catch";

export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;

  const parsed = await parseBody(request, packagePauseInputSchema);
  if (!parsed.ok) return parsed.response;

  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(parsed.data.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    return fail("Invalid pause range", 400);
  }

  const { clientProfileId } = parsed.data;

  // Trainers may only pause packages for clients they are linked to.
  if (guard.user.role === UserRole.TRAINER) {
    const canAccessClient = await trainerLinkedToClientProfile(
      guard.user.id,
      clientProfileId,
    );
    if (!canAccessClient) return fail("Forbidden", 403);
  }

  // Half-open windows, so back-to-back pauses (one ending exactly where the
  // next begins) are fine — only a genuine overlap is refused.
  const overlapping = await prisma.packagePause.findFirst({
    where: {
      clientProfileId,
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
    select: { id: true },
  });
  if (overlapping) {
    return fail("Pause overlaps an existing pause", 409);
  }

  const currentInstant = now();

  const result = await prisma.$transaction(async (tx) => {
    const pause = await tx.packagePause.create({
      data: {
        clientProfileId,
        startsAt,
        endsAt,
        reason: parsed.data.reason,
      },
      select: {
        id: true,
        clientProfileId: true,
        startsAt: true,
        endsAt: true,
        reason: true,
      },
    });

    // Fetch before cancelling: the freed sessions feed post-commit waitlist
    // promotion (one booking per session per client, so ids are unique).
    // `gt: currentInstant` is what keeps an already-started session in the
    // window out of it.
    const bookings = await tx.booking.findMany({
      where: {
        clientProfileId,
        canceledAt: null,
        session: { startsAt: { gte: startsAt, lt: endsAt, gt: currentInstant } },
      },
      select: { id: true, sessionId: true },
    });
    const canceled = await tx.booking.updateMany({
      where: { id: { in: bookings.map((b) => b.id) } },
      data: { canceledAt: currentInstant },
    });

    const removedWaitlist = await tx.waitlistEntry.deleteMany({
      where: {
        clientProfileId,
        session: { startsAt: { gte: startsAt, lt: endsAt, gt: currentInstant } },
      },
    });

    const extendable = await findPackagesExtendableByPause(
      tx,
      clientProfileId,
      startsAt,
    );
    const extended = await extendPackagesForPause(
      tx,
      pause.id,
      extendable,
      startsAt,
      endsAt,
    );

    return {
      pause,
      canceledBookings: canceled.count,
      freedSessionIds: bookings.map((b) => b.sessionId),
      removedWaitlistEntries: removedWaitlist.count,
      extended,
    };
  });

  // Waitlist promotion per freed session — post-commit, exactly like the
  // normal cancel path, so a promotion failure can't roll back the pause.
  // The paused client's own entries were deleted in-tx, so they can never be
  // promoted back into a seat the pause just freed.
  for (const sessionId of result.freedSessionIds) {
    await prisma.$transaction((tx) => promoteNextWaitlistEntry(tx, sessionId));
  }

  // Tell the client what the pause did to them: how many reservations went,
  // and the date their package now runs to (the LATEST of the extended ones —
  // the one that outlives the rest). Post-commit and best-effort, matched to
  // waitlist promotion, so a failing notification can never fail the pause the
  // admin already committed.
  const latestExpiry = result.extended.reduce<Date | null>(
    (latest, pkg) => (latest === null || pkg.expiresAt > latest ? pkg.expiresAt : latest),
    null,
  );
  const client = await prisma.clientProfile.findUnique({
    where: { id: clientProfileId },
    select: { userId: true },
  });
  if (client) {
    await tryCatch(
      createSystemNotification(
        client.userId,
        NOTIFICATION_MESSAGE_KEYS.PACKAGE_PAUSED,
        "GENERAL",
        {
          packagePauseId: result.pause.id,
          canceledBookings: result.canceledBookings,
          ...(latestExpiry ? { expiresAt: latestExpiry.toISOString() } : {}),
        },
      ),
    );
  }

  return respond(
    packagePauseResponseSchema,
    {
      success: true,
      pause: result.pause,
      canceledBookings: result.canceledBookings,
      removedWaitlistEntries: result.removedWaitlistEntries,
      extendedPackages: result.extended.length,
    },
    201,
  );
}
