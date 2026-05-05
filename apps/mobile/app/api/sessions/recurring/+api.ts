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

  const anchor = new Date(parsed.data.startsAt);
  if (Number.isNaN(anchor.getTime())) return fail("Invalid startsAt date", 400);

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

  // Generate one session per selected weekday per week, for `weekCount` weeks.
  // Time-of-day is taken from `startsAt`. The week of `startsAt` is week 0; we
  // skip any per-weekday slot that lands strictly before `startsAt` so admins
  // can pick a Wednesday and have the first Monday slot start the *following*
  // week instead of in the past.
  const DAY_MS = 24 * 60 * 60 * 1000;
  const weekStart = new Date(anchor);
  weekStart.setDate(anchor.getDate() - anchor.getDay()); // back to Sunday of this week
  const weekdays = [...new Set(parsed.data.weekdays)].sort((a, b) => a - b);
  const createData: {
    classTypeId: string;
    roomId: string | undefined;
    trainerUserId: string;
    startsAt: Date;
    endsAt: Date;
    capacity: number;
  }[] = [];
  for (let week = 0; week < parsed.data.weekCount; week++) {
    for (const dow of weekdays) {
      const startsAt = new Date(
        weekStart.getTime() + (week * 7 + dow) * DAY_MS,
      );
      startsAt.setHours(
        anchor.getHours(),
        anchor.getMinutes(),
        anchor.getSeconds(),
        anchor.getMilliseconds(),
      );
      if (startsAt.getTime() < anchor.getTime()) continue;
      const endsAt = new Date(
        startsAt.getTime() + parsed.data.durationMins * 60 * 1000,
      );
      createData.push({
        classTypeId: parsed.data.classTypeId,
        roomId: parsed.data.roomId,
        trainerUserId,
        startsAt,
        endsAt,
        capacity: parsed.data.capacity,
      });
    }
  }
  if (createData.length === 0) {
    return fail("No sessions to create — selected weekdays produce no slots", 400);
  }

  const timeOfDayMins = anchor.getHours() * 60 + anchor.getMinutes();

  const result = await prisma.$transaction(async (tx) => {
    const schedule = await tx.recurringSchedule.create({
      data: {
        classTypeId: parsed.data.classTypeId,
        roomId: parsed.data.roomId,
        trainerUserId,
        weekdays,
        timeOfDayMins,
        durationMins: parsed.data.durationMins,
        capacity: parsed.data.capacity,
        isActive: parsed.data.isActive,
      },
    });
    const created = await Promise.all(
      createData.map((sessionData) =>
        tx.session.create({
          data: { ...sessionData, recurringScheduleId: schedule.id },
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            capacity: true,
            status: true,
            trainerUserId: true,
            recurringScheduleId: true,
          },
        }),
      ),
    );
    return { schedule, sessions: created };
  });

  return ok(
    {
      success: true,
      count: result.sessions.length,
      scheduleId: result.schedule.id,
      sessions: result.sessions,
    },
    201,
  );
}
