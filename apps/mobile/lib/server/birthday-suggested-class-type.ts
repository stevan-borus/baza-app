/**
 * Resolves which ClassType to suggest when granting a birthday gift to a Client.
 *
 * Resolution order (per CONTEXT.md → "Suggested ClassType (birthday gift)"):
 *   1. Currently-active ClientPackage's ClassType (most recent by startsAt) —
 *      only when its snapshotted set names exactly ONE ClassType. A mix
 *      package doesn't say which type the client favors, so it falls through.
 *   2. Most recent past Booking's ClassType (the truest "what do they train").
 *   3. None — admin must pick from the available isBirthdayGift PackageTypes.
 *
 * Returns the ClassType id, or null if no signal is available.
 *
 * "Currently-active" means: startsAt <= now <= expiresAt AND sessionsRemaining > 0.
 * Package pauses are not considered here — they only affect booking eligibility,
 * not the choice of "what does this client usually train?".
 */
import { now } from "@/lib/now";
import { prisma } from "@/lib/server/prisma";

export async function resolveSuggestedClassType(
  clientProfileId: string,
): Promise<string | null> {
  const currentInstant = now();

  // 1. Active ClientPackage by startsAt desc.
  const activePackage = await prisma.clientPackage.findFirst({
    where: {
      clientProfileId,
      startsAt: { lte: currentInstant },
      expiresAt: { gte: currentInstant },
      sessionsRemaining: { gt: 0 },
      // A revoked package is not "what the client trains" anymore — fall
      // through to the recent-booking heuristic instead.
      revokedAt: null,
    },
    orderBy: { startsAt: "desc" },
    select: { classTypes: { select: { classTypeId: true } } },
  });
  if (activePackage && activePackage.classTypes.length === 1) {
    return activePackage.classTypes[0].classTypeId;
  }

  // 2. Most recent past Booking by session startsAt desc.
  const recentBooking = await prisma.booking.findFirst({
    where: {
      clientProfileId,
      canceledAt: null,
      session: { startsAt: { lte: currentInstant } },
    },
    orderBy: { session: { startsAt: "desc" } },
    select: { session: { select: { classTypeId: true } } },
  });
  if (recentBooking) return recentBooking.session.classTypeId;

  // 3. No signal.
  return null;
}
