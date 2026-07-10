import {
  createRecurringSessionsInputSchema,
  createRecurringSessionsResponseSchema,
} from "@baza/types/scheduling";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { respond, fail } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { findScheduleConflict } from "@/lib/server/schedule-conflict";
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

  // Schedule conflict: scan EVERY generated occurrence, not just the first.
  // The previous "first slot only" check let a series silently conflict on a
  // later Monday (e.g. trainer had a one-off booked on the 3rd Monday). We
  // cap the response at MAX_CONFLICTS_REPORTED — long lists aren't useful;
  // the admin needs to pick a different slot or skip those dates.
  const MAX_CONFLICTS_REPORTED = 3;
  const conflicts: Array<{
    occurrenceStartsAt: string;
    occurrenceEndsAt: string;
    kind: "room" | "trainer";
    sessionId: string;
    existingStartsAt: string;
    existingEndsAt: string;
    existingRoomName: string | null;
    existingTrainerName: string | null;
    existingClassTypeName: string | null;
  }> = [];
  let totalConflictCount = 0;
  for (const slot of createData) {
    const conflict = await findScheduleConflict({
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      roomId: slot.roomId,
      trainerUserId: slot.trainerUserId,
    });
    if (conflict) {
      totalConflictCount += 1;
      if (conflicts.length < MAX_CONFLICTS_REPORTED) {
        conflicts.push({
          occurrenceStartsAt: slot.startsAt.toISOString(),
          occurrenceEndsAt: slot.endsAt.toISOString(),
          ...conflict,
        });
      }
    }
  }
  if (conflicts.length > 0) {
    // contract-exempt: 409 schedule-conflict payload, not a success contract
    return Response.json(
      {
        success: false,
        error: "Schedule conflict",
        conflicts,
        conflictCount: totalConflictCount,
        totalOccurrences: createData.length,
      },
      { status: 409 },
    );
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

  return respond(
    createRecurringSessionsResponseSchema,
    {
      success: true,
      count: result.sessions.length,
      scheduleId: result.schedule.id,
      sessions: result.sessions,
    },
    201,
  );
}
