// POST /api/packages/pauses/[id]/end — end a pause early (or call one off).
//
// Product decision: the extension a pause grants is paid for by the time the
// client actually spent frozen. If the client comes back sooner than planned,
// the unused tail must go back — otherwise a 30-day pause cut short after two
// days still hands out 30 days of expiry.
//
// The pause row is truncated to the moment it ended rather than deleted, so
// the frozen stretch stays on the record and the days already credited stay
// earned. A pause that had NOT started yet is deleted outright: it froze
// nothing, so there is nothing to keep and its whole grant is refunded.
//
// Bookings the pause cancelled are deliberately NOT restored. Those seats went
// back into circulation the moment the pause committed, and waitlisted clients
// may already have been promoted into them — re-booking would be guesswork
// about capacity that has since moved. The client re-books what they still
// want.
import { endPackagePauseResponseSchema } from "@baza/types/packages";
import { UserRole } from "@/generated/prisma";
import { now } from "@/lib/now";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, respond } from "@/lib/server/http";
import { refundUnusedPauseCredits } from "@/lib/server/package-pause";
import { prisma } from "@/lib/server/prisma";
import { trainerLinkedToClientProfile } from "@/lib/server/trainer-scope";

type RouteParams = Record<string, string>;

export async function POST(request: Request, { id }: RouteParams) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;

  const pause = await prisma.packagePause.findUnique({
    where: { id },
    select: { id: true, clientProfileId: true, startsAt: true, endsAt: true },
  });
  if (!pause) return fail("Pause not found", 404);

  // Same scope rule as creating a pause: trainers only for linked clients.
  if (guard.user.role === UserRole.TRAINER) {
    const canAccessClient = await trainerLinkedToClientProfile(
      guard.user.id,
      pause.clientProfileId,
    );
    if (!canAccessClient) return fail("Forbidden", 403);
  }

  const currentInstant = now();
  if (pause.endsAt <= currentInstant) {
    return fail("Pause has already finished", 409);
  }

  const notStarted = pause.startsAt > currentInstant;
  // A pause that never ran ends where it would have begun, so every credited
  // millisecond is refunded; one already running ends now.
  const actualEndsAt = notStarted ? pause.startsAt : currentInstant;

  await prisma.$transaction(async (tx) => {
    await refundUnusedPauseCredits(tx, pause.id, pause.startsAt, actualEndsAt);
    if (notStarted) {
      await tx.packagePause.delete({ where: { id: pause.id } });
    } else {
      await tx.packagePause.update({
        where: { id: pause.id },
        data: { endsAt: actualEndsAt },
      });
    }
  });

  return respond(endPackagePauseResponseSchema, {
    success: true,
    pause: notStarted
      ? null
      : { id: pause.id, endsAt: actualEndsAt.toISOString() },
  });
}
