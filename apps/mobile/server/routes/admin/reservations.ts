import {
  createReservationsInputSchema,
  createReservationsResponseSchema,
} from "@baza/types/bookings";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { respond, fail, parseBody } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";

export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const parsed = await parseBody(request, createReservationsInputSchema);
  if (!parsed.ok) return parsed.response;
  const { clientProfileId, sessionIds } = parsed.data;

  const clientProfile = await prisma.clientProfile.findUnique({
    where: { id: clientProfileId },
    select: { id: true },
  });
  if (!clientProfile) return fail("Client not found", 404);

  // Single transaction so partial failures roll back cleanly.
  const result = await prisma.$transaction(async (tx) => {
    const sessions = await tx.session.findMany({
      where: { id: { in: sessionIds } },
      select: {
        id: true,
        capacity: true,
        bookings: {
          where: { canceledAt: null },
          select: { id: true, clientProfileId: true },
        },
      },
    });
    const sessionById = new Map(sessions.map((s) => [s.id, s]));

    const reserved: string[] = [];
    const skippedFull: string[] = [];
    const skippedAlreadyBooked: string[] = [];
    const skippedMissing: string[] = [];

    for (const sessionId of sessionIds) {
      const session = sessionById.get(sessionId);
      if (!session) {
        skippedMissing.push(sessionId);
        continue;
      }
      const activeBookings = session.bookings.length;
      const alreadyBooked = session.bookings.some(
        (b) => b.clientProfileId === clientProfileId,
      );
      if (alreadyBooked) {
        skippedAlreadyBooked.push(sessionId);
        continue;
      }
      if (activeBookings >= session.capacity) {
        skippedFull.push(sessionId);
        continue;
      }
      // Upsert, not create: cancelling stamps `canceledAt` and leaves the row
      // in place, but `@@unique([sessionId, clientProfileId])` only allows one
      // row per pair — so a plain create on a re-reserve throws P2002. Revive
      // the cancelled row instead, exactly as the client booking path does
      // (`server/routes/bookings.ts`). `createdByUserId` is re-stamped so the
      // audit names the admin who made the reservation that now stands.
      await tx.booking.upsert({
        where: { sessionId_clientProfileId: { sessionId, clientProfileId } },
        create: {
          sessionId,
          clientProfileId,
          clientPackageId: null,
          createdByUserId: guard.user.id,
        },
        update: {
          canceledAt: null,
          clientPackageId: null,
          // Audit hygiene, not behaviour: `waivedByUserId` records WHO forgave
          // a specific late-cancel charge, and `canceledAt` is its "when"
          // (ADR-0008). Clearing that timestamp without this would leave a
          // waiver stamped on a booking with no cancellation to belong to.
          // Nothing reads the field to make a decision — a waiver's real
          // effect is the SessionConsumption row it never wrote, which this
          // does not touch (see `routes/clients/[id]/bookings.ts`).
          waivedByUserId: null,
          createdByUserId: guard.user.id,
        },
      });
      reserved.push(sessionId);
    }

    return { reserved, skippedFull, skippedAlreadyBooked, skippedMissing };
  });

  return respond(createReservationsResponseSchema, {
    success: true,
    reserved: result.reserved.length,
    reservedSessionIds: result.reserved,
    skippedFull: result.skippedFull,
    skippedAlreadyBooked: result.skippedAlreadyBooked,
    skippedMissing: result.skippedMissing,
  });
}
