/** Trainer-scoped access checks: session ownership and client linkage. */
import { prisma } from "@/lib/server/prisma";

/**
 * Checks whether a session is assigned to the requesting trainer.
 */
export async function trainerOwnsSession(trainerUserId: string, sessionId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      trainerUserId: true,
    },
  });
  if (!session) return false;
  return session.trainerUserId === trainerUserId;
}

/**
 * Checks whether trainer has at least one active booking with the client.
 *
 * This is used as a practical access boundary for trainer-facing client actions.
 */
export async function trainerLinkedToClientProfile(
  trainerUserId: string,
  clientProfileId: string,
) {
  const linkedBooking = await prisma.booking.findFirst({
    where: {
      clientProfileId,
      canceledAt: null,
      session: {
        trainerUserId,
      },
    },
    select: { id: true },
  });
  return Boolean(linkedBooking);
}
