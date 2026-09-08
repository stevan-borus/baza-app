// PATCH /api/packages/pauses/[id] — move an existing pause's window.
//
// The admin books a pause from a date the client gave them, and the client
// then changes their travel dates. Without this the only recourse was ending
// the pause and creating a new one, which loses the row and its reason.
//
// The grant is REFUNDED IN FULL and then re-granted from the new window,
// rather than adjusted by the difference. `refundUnusedPauseCredits` with
// `actualEndsAt === startsAt` serves zero milliseconds, so every package gets
// its whole grant back and the credit rows go; `extendPackagesForPause` then
// grants the new window as if the pause were being created now. Adjusting by
// a delta would need the old and new overlaps to agree package by package,
// and they don't: a package can expire inside one window and not the other.
//
// What may change depends on where the pause is:
//   - Not started yet or already running: both ends and the reason are free.
//     A running pause whose start moves is safe because nothing is adjusted
//     in place: the extension is recomputed from scratch off the new window,
//     and reservations the old window already cancelled stay cancelled — the
//     same outcome as ending the pause early and creating a replacement.
//   - Finished: nothing. That window is history (409).
//
// A start may move BACKWARD, into days that have already passed — "I was away
// from the 1st, not the 2nd" is a correction, not a new pause. Two consequences
// that look like bugs but aren't: the widened window grants extension credit
// for those past days too (right — the client really was away then), and the
// reservation sweep's `gt: currentInstant` skips sessions inside the widened
// window that have already started, so anything the client actually attended
// stays booked and attended.
// A new `endsAt` in the past is refused too — cutting a pause short is
// POST .../end's job, which truncates to `now()` and keeps the served days.
//
// Reservations inside the NEW window are cancelled exactly as creating a
// pause does. Reservations the OLD window cancelled but the new one no longer
// covers are NOT restored: those seats went back into circulation and may
// already hold a promoted client, so re-booking would be guesswork about
// capacity that has since moved.
import { NOTIFICATION_MESSAGE_KEYS } from "@baza/i18n";
import {
  updatePackagePauseInputSchema,
  updatePackagePauseResponseSchema,
} from "@baza/types/packages";
import { UserRole } from "@/generated/prisma";
import { now } from "@/lib/now";
import { requireRole } from "@/lib/server/auth-guards";
import { promoteNextWaitlistEntry } from "@/lib/server/booking-cancellation";
import { respond, fail, parseBody } from "@/lib/server/http";
import { createSystemNotification } from "@/lib/server/notifications";
import {
  cancelReservationsInWindow,
  extendPackagesForPause,
  findPackagesExtendableByPause,
  refundUnusedPauseCredits,
} from "@/lib/server/package-pause";
import { prisma } from "@/lib/server/prisma";
import { trainerLinkedToClientProfile } from "@/lib/server/trainer-scope";
import { tryCatch } from "@/lib/server/try-catch";

type RouteParams = Record<string, string>;

export async function PATCH(request: Request, { id }: RouteParams) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;

  const existing = await prisma.packagePause.findUnique({
    where: { id },
    select: { id: true, clientProfileId: true, startsAt: true, endsAt: true },
  });
  if (!existing) return fail("Pause not found", 404);

  // Same scope rule as creating and ending: trainers only for linked clients.
  if (guard.user.role === UserRole.TRAINER) {
    const canAccessClient = await trainerLinkedToClientProfile(
      guard.user.id,
      existing.clientProfileId,
    );
    if (!canAccessClient) return fail("Forbidden", 403);
  }

  const parsed = await parseBody(request, updatePackagePauseInputSchema);
  if (!parsed.ok) return parsed.response;

  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(parsed.data.endsAt);
  if (
    Number.isNaN(startsAt.getTime()) ||
    Number.isNaN(endsAt.getTime()) ||
    endsAt <= startsAt
  ) {
    return fail("Invalid pause range", 400);
  }

  const currentInstant = now();
  if (existing.endsAt <= currentInstant) {
    return fail("Pause has already finished", 409);
  }
  if (endsAt <= currentInstant) {
    return fail("Pause end must be in the future", 400);
  }

  // Same half-open predicate as the create route, minus this pause's own row:
  // an edit that shrinks or nudges its own window must not collide with itself.
  const overlapping = await prisma.packagePause.findFirst({
    where: {
      clientProfileId: existing.clientProfileId,
      id: { not: existing.id },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
    select: { id: true },
  });
  if (overlapping) {
    return fail("Pause overlaps an existing pause", 409);
  }

  const result = await prisma.$transaction(async (tx) => {
    // Hand back the whole old grant first (serving zero ms), so what follows
    // grants the new window against untouched expiry dates.
    await refundUnusedPauseCredits(
      tx,
      existing.id,
      existing.startsAt,
      existing.startsAt,
    );

    const pause = await tx.packagePause.update({
      where: { id: existing.id },
      data: {
        startsAt,
        endsAt,
        // Absent leaves the reason as it was; explicit null clears it.
        ...(parsed.data.reason === undefined ? {} : { reason: parsed.data.reason }),
      },
      select: {
        id: true,
        clientProfileId: true,
        startsAt: true,
        endsAt: true,
        reason: true,
      },
    });

    const cleared = await cancelReservationsInWindow(
      tx,
      existing.clientProfileId,
      startsAt,
      endsAt,
      currentInstant,
    );

    const extendable = await findPackagesExtendableByPause(
      tx,
      existing.clientProfileId,
      startsAt,
    );
    const extended = await extendPackagesForPause(
      tx,
      pause.id,
      extendable,
      startsAt,
      endsAt,
    );

    return { pause, ...cleared, extended };
  });

  // Post-commit, as on create: a promotion failure must not roll back an edit
  // the admin already committed.
  for (const sessionId of result.freedSessionIds) {
    await prisma.$transaction((tx) => promoteNextWaitlistEntry(tx, sessionId));
  }

  const latestExpiry = result.extended.reduce<Date | null>(
    (latest, pkg) => (latest === null || pkg.expiresAt > latest ? pkg.expiresAt : latest),
    null,
  );
  const client = await prisma.clientProfile.findUnique({
    where: { id: existing.clientProfileId },
    select: { userId: true },
  });
  if (client) {
    await tryCatch(
      createSystemNotification(
        client.userId,
        NOTIFICATION_MESSAGE_KEYS.PACKAGE_PAUSE_UPDATED,
        "GENERAL",
        {
          packagePauseId: result.pause.id,
          canceledBookings: result.canceledBookings,
          startsAt: result.pause.startsAt.toISOString(),
          endsAt: result.pause.endsAt.toISOString(),
          ...(latestExpiry ? { expiresAt: latestExpiry.toISOString() } : {}),
        },
      ),
    );
  }

  return respond(updatePackagePauseResponseSchema, {
    success: true,
    pause: result.pause,
    canceledBookings: result.canceledBookings,
    removedWaitlistEntries: result.removedWaitlistEntries,
    extendedPackages: result.extended.length,
  });
}
