import {
  createReservationsInputSchema,
  createReservationsResponseSchema,
} from "@baza/types/bookings";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { respond, fail } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";

export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const raw: unknown = await request.json().catch(() => null);
  const parsed = createReservationsInputSchema.safeParse(raw);
  if (!parsed.success) return fail("Invalid payload", 400, parsed.error);
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
      await tx.booking.create({
        data: {
          sessionId,
          clientProfileId,
          clientPackageId: null,
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
