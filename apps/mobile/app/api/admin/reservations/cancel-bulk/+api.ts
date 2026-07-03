import { formatFullName } from "@baza/types/common";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import {
  applyLateCancelForfeit,
  promoteNextWaitlistEntry,
} from "@/lib/server/booking-cancellation";
import { fail, ok } from "@/lib/server/http";
import { notifyClient } from "@/lib/server/notify-client";
import {
  coalesceTrainerCancelCounts,
  notifyOperators,
} from "@/lib/server/notify-operators";
import { now } from "@/lib/now";
import { prisma } from "@/lib/server/prisma";

type CancelBulkBody = { bookingIds?: unknown; waiveCharge?: unknown };

export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const raw = (await request.json().catch(() => null)) as CancelBulkBody | null;
  if (!raw) return fail("Invalid JSON body", 400);
  const bookingIds = Array.isArray(raw.bookingIds)
    ? raw.bookingIds.filter((id): id is string => typeof id === "string")
    : [];
  if (bookingIds.length === 0) return fail("Missing bookingIds", 400);
  const waiveCharge = raw.waiveCharge === true;

  const cancellationTime = now();

  const bookings = await prisma.booking.findMany({
    where: { id: { in: bookingIds }, canceledAt: null },
    select: {
      id: true,
      sessionId: true,
      clientProfileId: true,
      clientPackageId: true,
      clientPackage: { select: { id: true, lateCancelHours: true } },
      clientProfile: {
        select: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              notificationPreference: {
                select: { bookingEmailsEnabled: true, preferredLocale: true },
              },
            },
          },
        },
      },
      session: {
        select: {
          id: true,
          startsAt: true,
          classTypeId: true,
          trainerUserId: true,
          classType: { select: { name: true } },
        },
      },
    },
  });
  if (bookings.length === 0) return ok({ success: true, canceled: 0 });

  const initiatorId = guard.user.id;

  // Atomic cancel + late-cancel forfeit.
  await prisma.$transaction(async (tx) => {
    await tx.booking.updateMany({
      where: { id: { in: bookings.map((b) => b.id) }, canceledAt: null },
      data: { canceledAt: cancellationTime },
    });
    for (const b of bookings) {
      const result = await applyLateCancelForfeit(tx, {
        clientProfileId: b.clientProfileId,
        sessionId: b.sessionId,
        clientPackageId: b.clientPackageId,
        sessionStartsAt: b.session.startsAt,
        canceledAt: cancellationTime,
        lateCancelHours: b.clientPackage?.lateCancelHours ?? 0,
        waiveCharge,
      });
      // Charge waiver: a real forfeit would have applied, but the admin chose
      // to forgive it — record who waived.
      if (result === "WAIVED") {
        await tx.booking.update({
          where: { id: b.id },
          data: { waivedByUserId: initiatorId },
        });
      }
    }
  });

  // Waitlist promotion per session.
  const promotedUserIds = new Set<string>();
  for (const b of bookings) {
    const promotedUserId = await prisma.$transaction((tx) =>
      promoteNextWaitlistEntry(tx, b.sessionId),
    );
    if (promotedUserId) promotedUserIds.add(promotedUserId);
  }

  // Collapsed notification fan-out. Group bookings by trainer and by client.
  // We only fan out one notification per (recipient × client × initiating-admin).
  const byClient = new Map<
    string,
    {
      clientFullName: string;
      recipient: {
        email: string | null;
        bookingEmailsEnabled: boolean;
        preferredLocale: "sr" | "en" | null;
      };
      bookings: typeof bookings;
    }
  >();
  for (const b of bookings) {
    const u = b.clientProfile.user;
    const clientFullName = formatFullName(u.firstName, u.lastName);
    const clientUserId = u.id;
    const bucket = byClient.get(clientUserId) ?? {
      clientFullName,
      // Email/pref already loaded with the bookings — no per-client re-query.
      recipient: {
        email: u.email,
        bookingEmailsEnabled: u.notificationPreference?.bookingEmailsEnabled ?? true,
        preferredLocale: u.notificationPreference?.preferredLocale ?? null,
      },
      bookings: [],
    };
    bucket.bookings.push(b);
    byClient.set(clientUserId, bucket);
  }

  void (async () => {
    for (const [clientUserId, bucket] of byClient) {
      // Client-facing email. A single-booking cancel gets the singular
      // ADMIN_CANCEL copy; two or more get the BULK_CANCEL summary with the
      // count. (There is no separate single-cancel route — one cancel arrives
      // here with count===1 — so this is where the singular case is handled.)
      const count = bucket.bookings.length;
      void notifyClient({
        userId: clientUserId,
        event: count === 1 ? "ADMIN_CANCEL" : "BULK_CANCEL",
        vars: { count },
        recipient: bucket.recipient,
      });
      // Operator fan-out, coalesced: one notification per affected trainer
      // (with their share of the count), one per other admin (with the
      // client's total), none to the initiating admin.
      await notifyOperators({
        event: "BULK_RESERVATION_CANCEL",
        excludeUserId: initiatorId,
        trainers: coalesceTrainerCancelCounts(
          bucket.bookings.map((b) => b.session.trainerUserId),
        ),
        payload: { clientFullName: bucket.clientFullName, count },
      });
    }

    // Coalesced waitlist-promotion notice: one per promoted client, fanned
    // across in-app + email by the dispatcher. (Promoted clients aren't
    // necessarily in `byClient`, so the dispatcher resolves their recipient.)
    for (const userId of promotedUserIds) {
      await notifyClient({
        userId,
        event: "WAITLIST_PROMOTED",
        vars: { state: "WAITLIST_PROMOTED" },
      });
    }
  })();

  return ok({
    success: true,
    canceled: bookings.length,
    promotedUserIds: [...promotedUserIds],
  });
}
