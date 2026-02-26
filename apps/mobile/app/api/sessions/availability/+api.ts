import { monthlyAvailabilityQuerySchema } from "@baza/types";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";

function getMonthRange(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthIndex - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
  return { start, end };
}

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER, UserRole.CLIENT]);
  if (!guard.ok) return guard.response;
  const url = new URL(request.url);
  const month = url.searchParams.get("month");
  const parsed = monthlyAvailabilityQuerySchema.safeParse({ month });
  if (!parsed.success) return fail("Invalid month format. Use YYYY-MM", 400, parsed.error);

  const { start, end } = getMonthRange(parsed.data.month);

  // Trainers see only their assigned sessions; admins/clients see all.
  const sessions = await prisma.session.findMany({
    where: {
      startsAt: { gte: start, lt: end },
      status: "SCHEDULED",
      ...(guard.user.role === UserRole.TRAINER
        ? {
            trainerUserId: guard.user.id,
          }
        : {}),
    },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      capacity: true,
      classType: { select: { name: true } },
      room: { select: { name: true } },
      _count: {
        select: {
          bookings: {
            where: { canceledAt: null },
          },
          waitlist: true,
        },
      },
    },
    orderBy: { startsAt: "asc" },
  });

  return ok({
    success: true,
    month: parsed.data.month,
    sessions: sessions.map((session: (typeof sessions)[number]) => ({
      id: session.id,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      classTypeName: session.classType.name,
      roomName: session.room?.name ?? null,
      capacity: session.capacity,
      bookedCount: session._count.bookings,
      waitlistCount: session._count.waitlist,
      availableSlots: Math.max(session.capacity - session._count.bookings, 0),
    })),
  });
}
