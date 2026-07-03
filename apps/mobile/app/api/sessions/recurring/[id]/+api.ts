import { updateRecurringSeriesInputSchema } from "@baza/types/scheduling";
import { UserRole } from "@/generated/prisma";
import { now } from "@/lib/now";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { tryCatch } from "@/lib/server/try-catch";

type RouteParams = Record<string, string>;

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(_request: Request, { id }: RouteParams) {
  const schedule = await prisma.recurringSchedule.findUnique({
    where: { id },
  });
  if (!schedule) return fail("Schedule not found", 404);
  const futureBookingsCount = await prisma.booking.count({
    where: {
      canceledAt: null,
      session: {
        recurringScheduleId: id,
        startsAt: { gte: now() },
      },
    },
  });
  return ok({ success: true, schedule, futureBookingsCount });
}

export async function PATCH(request: Request, { id }: RouteParams) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const bodyResult = await tryCatch(request.json());
  const body = bodyResult.error ? null : bodyResult.data;
  const parsed = updateRecurringSeriesInputSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid payload", 400, parsed.error);

  const existing = await prisma.recurringSchedule.findUnique({
    where: { id },
  });
  if (!existing) return fail("Schedule not found", 404);

  const data = parsed.data;
  const isScheduleEdit =
    data.weekdays !== undefined ||
    data.timeOfDayMins !== undefined ||
    data.durationMins !== undefined ||
    data.weekCount !== undefined;

  const nextWeekdays = data.weekdays
    ? [...new Set(data.weekdays)].sort((a, b) => a - b)
    : existing.weekdays;
  const nextTimeOfDay =
    data.timeOfDayMins !== undefined
      ? data.timeOfDayMins
      : existing.timeOfDayMins;
  const nextDuration =
    data.durationMins !== undefined
      ? data.durationMins
      : existing.durationMins;
  const nextCapacity =
    data.capacity !== undefined ? data.capacity : existing.capacity;
  const nextRoomId =
    data.roomId === undefined ? existing.roomId : data.roomId;
  const nextTrainerId =
    data.trainerUserId === undefined
      ? existing.trainerUserId
      : data.trainerUserId;
  const nextIsActive =
    data.isActive === undefined ? existing.isActive : data.isActive;

  const currentInstant = now();

  // For schedule-shape edits, refuse if any future session has live bookings —
  // admin must cancel bookings (or edit per-session) before reshaping.
  if (isScheduleEdit) {
    const blocked = await prisma.session.findFirst({
      where: {
        recurringScheduleId: id,
        startsAt: { gte: currentInstant },
        bookings: { some: { canceledAt: null } },
      },
      select: { id: true, startsAt: true },
    });
    if (blocked) {
      return fail(
        "Future sessions have bookings — cancel them or edit those sessions individually",
        409,
      );
    }
  }

  // Hide-OFF guard: refuse to deactivate the series if any future session has
  // live bookings. Admin must cancel those bookings first.
  if (nextIsActive === false && existing.isActive) {
    const blocked = await prisma.session.findFirst({
      where: {
        recurringScheduleId: id,
        startsAt: { gte: currentInstant },
        bookings: { some: { canceledAt: null } },
      },
      select: { id: true },
    });
    if (blocked) {
      return fail(
        "Cannot hide series — future sessions have active bookings. Cancel them first.",
        409,
      );
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const schedule = await tx.recurringSchedule.update({
      where: { id },
      data: {
        roomId: nextRoomId,
        trainerUserId: nextTrainerId,
        weekdays: nextWeekdays,
        timeOfDayMins: nextTimeOfDay,
        durationMins: nextDuration,
        capacity: nextCapacity,
        isActive: nextIsActive,
      },
    });

    if (!isScheduleEdit) {
      // Plain in-place edit of room/trainer/capacity for all future sessions.
      await tx.session.updateMany({
        where: {
          recurringScheduleId: id,
          startsAt: { gte: currentInstant },
        },
        data: {
          roomId: nextRoomId,
          trainerUserId: nextTrainerId,
          capacity: nextCapacity,
        },
      });
    } else {
      // Reshape: drop all future un-booked sessions, regenerate from now.
      // weekCount defaults to a horizon derived from existing sessions (last
      // session date - now), so the series keeps its overall length.
      const lastFuture = await tx.session.findFirst({
        where: {
          recurringScheduleId: id,
          startsAt: { gte: currentInstant },
        },
        orderBy: { startsAt: "desc" },
        select: { startsAt: true },
      });
      const horizonMs = lastFuture
        ? Math.max(lastFuture.startsAt.getTime() - currentInstant.getTime(), 0)
        : 0;
      const defaultWeekCount = Math.max(
        1,
        Math.ceil(horizonMs / (7 * DAY_MS)),
      );
      const weekCount = data.weekCount ?? defaultWeekCount;

      await tx.session.deleteMany({
        where: {
          recurringScheduleId: id,
          startsAt: { gte: currentInstant },
          bookings: { none: { canceledAt: null } },
        },
      });

      const weekStart = new Date(currentInstant);
      weekStart.setHours(0, 0, 0, 0);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());

      const hours = Math.floor(nextTimeOfDay / 60);
      const minutes = nextTimeOfDay % 60;

      const newSlots: { startsAt: Date; endsAt: Date }[] = [];
      for (let week = 0; week < weekCount; week++) {
        for (const dow of nextWeekdays) {
          const startsAt = new Date(
            weekStart.getTime() + (week * 7 + dow) * DAY_MS,
          );
          startsAt.setHours(hours, minutes, 0, 0);
          if (startsAt.getTime() < currentInstant.getTime()) continue;
          const endsAt = new Date(
            startsAt.getTime() + nextDuration * 60 * 1000,
          );
          newSlots.push({ startsAt, endsAt });
        }
      }

      // Avoid colliding with sessions that survived (booked ones at same time).
      const surviving = await tx.session.findMany({
        where: {
          recurringScheduleId: id,
          startsAt: { gte: currentInstant },
        },
        select: { startsAt: true },
      });
      const survivingSet = new Set(
        surviving.map((s) => s.startsAt.toISOString()),
      );

      const toCreate = newSlots.filter(
        (s) => !survivingSet.has(s.startsAt.toISOString()),
      );

      if (toCreate.length > 0) {
        await tx.session.createMany({
          data: toCreate.map((s) => ({
            classTypeId: schedule.classTypeId,
            roomId: nextRoomId,
            trainerUserId: nextTrainerId,
            recurringScheduleId: id,
            startsAt: s.startsAt,
            endsAt: s.endsAt,
            capacity: nextCapacity,
          })),
        });
      }
    }

    return schedule;
  });

  return ok({ success: true, schedule: result });
}

export async function DELETE(request: Request, { id }: RouteParams) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const blocked = await prisma.session.findFirst({
    where: {
      recurringScheduleId: id,
      bookings: { some: { canceledAt: null } },
    },
    select: { id: true },
  });
  if (blocked) {
    return fail(
      "Series has booked sessions — cancel bookings before deleting",
      409,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.session.deleteMany({ where: { recurringScheduleId: id } });
    await tx.recurringSchedule.delete({ where: { id } });
  });

  return ok({ success: true });
}
