import {
  createSessionInputSchema,
  sessionsListResponseSchema,
  sessionMutationResponseSchema,
} from "@baza/types/scheduling";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { respond, fail, parseBody } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { findScheduleConflict } from "@/lib/server/schedule-conflict";

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;

  // Trainers see only their assigned + active sessions; admins see all. Cap at 200.
  const sessions = await prisma.session.findMany({
    where:
      guard.user.role === UserRole.TRAINER
        ? {
            trainerUserId: guard.user.id,
            OR: [
              { recurringScheduleId: null, isActive: true },
              {
                recurringScheduleId: { not: null },
                recurringSchedule: { isActive: true },
              },
            ],
          }
        : undefined,
    orderBy: { startsAt: "asc" },
    take: 200,
    include: {
      classType: { select: { name: true } },
      room: { select: { name: true } },
      _count: {
        select: {
          bookings: {
            where: { canceledAt: null },
          },
        },
      },
    },
  });

  return respond(sessionsListResponseSchema, {
    success: true,
    sessions: sessions.map((item: (typeof sessions)[number]) => ({
      id: item.id,
      classTypeId: item.classTypeId,
      classTypeName: item.classType.name,
      classType: { id: item.classTypeId, name: item.classType.name },
      roomId: item.roomId,
      roomName: item.room?.name ?? null,
      room: item.room
        ? { id: item.roomId as string, name: item.room.name }
        : null,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      status: item.status,
      capacity: item.capacity,
      isIntermediate: item.isIntermediate,
      isMixedGroup: item.isMixedGroup,
      trainerUserId: item.trainerUserId,
      bookings: item._count.bookings,
    })),
  });
}

export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;

  const parsed = await parseBody(request, createSessionInputSchema);
  if (!parsed.ok) return parsed.response;

  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(parsed.data.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    return fail("Invalid schedule range", 400);
  }

  // Trainers cannot create sessions for other trainers.
  if (
    guard.user.role === UserRole.TRAINER &&
    parsed.data.trainerUserId &&
    parsed.data.trainerUserId !== guard.user.id
  ) {
    return fail("Trainers can only create sessions assigned to themselves", 403);
  }

  const trainerUserId =
    guard.user.role === UserRole.TRAINER
      ? guard.user.id
      : parsed.data.trainerUserId;

  // Schedule conflict: refuse if another live session overlaps on the same
  // room (when set) OR the same trainer. CANCELED sessions don't block.
  const conflict = await findScheduleConflict({
    startsAt,
    endsAt,
    roomId: parsed.data.roomId,
    trainerUserId,
  });
  if (conflict) {
    // contract-exempt: 409 schedule-conflict payload, not a success contract
    return Response.json(
      {
        success: false,
        error: "Schedule conflict",
        conflict,
      },
      { status: 409 },
    );
  }

  const session = await prisma.session.create({
    data: {
      classTypeId: parsed.data.classTypeId,
      roomId: parsed.data.roomId,
      trainerUserId,
      startsAt,
      endsAt,
      capacity: parsed.data.capacity,
      isActive: parsed.data.isActive,
    },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      capacity: true,
      status: true,
      isActive: true,
      isIntermediate: true,
      isMixedGroup: true,
      classTypeId: true,
      classType: { select: { id: true, name: true } },
      roomId: true,
      room: { select: { id: true, name: true } },
      trainerUserId: true,
    },
  });

  return respond(sessionMutationResponseSchema, { success: true, session }, 201);
}
