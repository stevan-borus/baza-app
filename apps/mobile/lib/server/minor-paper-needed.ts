/**
 * Fires MINOR_PAPER_NEEDED notifications to all active admins when a minor
 * client completes their first session and their waiver_minor consent record
 * has not yet been physically verified by a guardian.
 *
 * Guards:
 *   - client must be a minor at completion time (age < 18)
 *   - the session being completed must be the client's FIRST completed session
 *   - the client's most recent accepted waiver_minor must have guardianVerifiedAt: null
 */
import { NotificationType } from "@/generated/prisma";
import { now } from "@/lib/now";
import { formatFullName } from "@baza/types";
import { NOTIFICATION_MESSAGE_KEYS } from "@baza/i18n";
import { createSystemNotification } from "@/lib/server/notifications";
import { prisma } from "@/lib/server/prisma";

export async function maybeNotifyMinorPaperNeeded(sessionId: string): Promise<void> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      bookings: {
        where: { canceledAt: null },
        select: {
          clientProfile: {
            select: {
              id: true,
              dateOfBirth: true,
              user: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  });
  if (!session) return;

  // Fetch active admins once — before iterating bookings.
  // If there are no admins to notify, skip the entire loop.
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });
  if (admins.length === 0) return;

  const today = now();

  for (const booking of session.bookings) {
    const cp = booking.clientProfile;
    if (!cp?.dateOfBirth || !cp.user) continue;

    if (!isMinor(cp.dateOfBirth, today)) continue;

    // Only fire on the client's very first completed session — subsequent
    // completions would just re-spam admins who may already have the paper.
    const otherCompleted = await prisma.booking.count({
      where: {
        clientProfileId: cp.id,
        canceledAt: null,
        session: {
          status: "COMPLETED",
          NOT: { id: sessionId },
        },
      },
    });
    if (otherCompleted > 0) continue;

    // Guardian already collected the wet signature — nothing to do.
    const waiver = await prisma.consentRecord.findFirst({
      where: { userId: cp.user.id, documentKey: "waiver_minor", accepted: true },
      orderBy: { acceptedAt: "desc" },
      select: { guardianVerifiedAt: true },
    });
    if (waiver?.guardianVerifiedAt) continue;

    // Notify every active admin (list fetched once above).
    await Promise.all(
      admins.map((admin) =>
        createSystemNotification(
          admin.id,
          NOTIFICATION_MESSAGE_KEYS.MINOR_PAPER_NEEDED,
          NotificationType.MINOR_PAPER_NEEDED,
          {
            sessionId,
            userName: formatFullName(cp.user.firstName, cp.user.lastName),
            clientUserId: cp.user.id,
          },
        ),
      ),
    );
  }
}

function isMinor(dob: Date, asOf: Date): boolean {
  let age = asOf.getFullYear() - dob.getFullYear();
  const m = asOf.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && asOf.getDate() < dob.getDate())) age -= 1;
  return age < 18;
}
