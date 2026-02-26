import { createRecurringSessionsInputSchema } from "@baza/types";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { tryCatch } from "@/lib/server/try-catch";

export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;

  const bodyResult = await tryCatch(request.json());
  const body = bodyResult.error ? null : bodyResult.data;
  const parsed = createRecurringSessionsInputSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid payload", 400, parsed.error);

  const firstStartsAt = new Date(parsed.data.startsAt);
  if (Number.isNaN(firstStartsAt.getTime())) return fail("Invalid startsAt date", 400);

  // Trainers cannot create sessions for other trainers.
  if (
    guard.user.role === UserRole.TRAINER &&
    parsed.data.trainerUserId &&
    parsed.data.trainerUserId !== guard.user.id
  ) {
    return fail("Trainers can only create sessions assigned to themselves", 403);
  }
  const trainerUserId =
    guard.user.role === UserRole.TRAINER ? guard.user.id : parsed.data.trainerUserId;

  // Generate session slots at repeatEveryDays intervals from firstStartsAt.
  const createData = Array.from({ length: parsed.data.repeatCount }).map((_, index) => {
    const startsAt = new Date(
      firstStartsAt.getTime() + index * parsed.data.repeatEveryDays * 24 * 60 * 60 * 1000,
    );
    const endsAt = new Date(startsAt.getTime() + parsed.data.durationMins * 60 * 1000);
    return {
      classTypeId: parsed.data.classTypeId,
      roomId: parsed.data.roomId,
      trainerUserId,
      startsAt,
      endsAt,
      capacity: parsed.data.capacity,
    };
  });

  const sessions = await prisma.$transaction(
    createData.map((sessionData) =>
      prisma.session.create({
        data: sessionData,
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          capacity: true,
          status: true,
          trainerUserId: true,
        },
      }),
    ),
  );

  return ok(
    {
      success: true,
      count: sessions.length,
      sessions,
    },
    201,
  );
}
