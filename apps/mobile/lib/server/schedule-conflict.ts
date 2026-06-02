/** Schedule conflict detection: a session overlaps another live session
 *  iff their [startsAt, endsAt) intervals intersect AND they share either a
 *  room (when set on both) or a trainer. CANCELED sessions never block.
 *
 *  The returned payload carries the offending existing session's display
 *  details (room name, trainer name, startsAt) so the API can return a
 *  human-readable message without the client having to make a second
 *  request to look up what's already booked.
 */
import { formatFullName } from "@baza/types";
import { prisma } from "@/lib/server/prisma";
import { SessionStatus } from "@/generated/prisma";

export type ScheduleConflict = {
  kind: "room" | "trainer";
  sessionId: string;
  /** ISO string of the existing session's start time. */
  existingStartsAt: string;
  /** ISO string of the existing session's end time. */
  existingEndsAt: string;
  /** Room name, if the existing session has one assigned. */
  existingRoomName: string | null;
  /** Trainer full name, if the existing session has one assigned. */
  existingTrainerName: string | null;
  /** Class type name of the existing session. */
  existingClassTypeName: string | null;
};

export type FindConflictArgs = {
  startsAt: Date;
  endsAt: Date;
  roomId: string | null | undefined;
  trainerUserId: string | null | undefined;
  /** Exclude a specific session (used by PATCH so we don't self-conflict). */
  excludeSessionId?: string;
};

const CONFLICT_INCLUDE = {
  id: true,
  startsAt: true,
  endsAt: true,
  room: { select: { name: true } },
  trainer: { select: { firstName: true, lastName: true } },
  classType: { select: { name: true } },
} as const;

type ConflictRow = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  room: { name: string } | null;
  trainer: { firstName: string; lastName: string } | null;
  classType: { name: string } | null;
};

function toConflict(row: ConflictRow, kind: "room" | "trainer"): ScheduleConflict {
  return {
    kind,
    sessionId: row.id,
    existingStartsAt: row.startsAt.toISOString(),
    existingEndsAt: row.endsAt.toISOString(),
    existingRoomName: row.room?.name ?? null,
    existingTrainerName: row.trainer
      ? formatFullName(row.trainer.firstName, row.trainer.lastName)
      : null,
    existingClassTypeName: row.classType?.name ?? null,
  };
}

export async function findScheduleConflict(
  args: FindConflictArgs,
): Promise<ScheduleConflict | null> {
  const { startsAt, endsAt, roomId, trainerUserId, excludeSessionId } = args;
  // Half-open [a, b) intervals overlap iff aStart < bEnd && bStart < aEnd.
  // Translated to a Prisma `where`: target.startsAt < endsAt AND target.endsAt > startsAt.
  const overlapWhere = {
    startsAt: { lt: endsAt },
    endsAt: { gt: startsAt },
    status: { not: SessionStatus.CANCELED },
    ...(excludeSessionId ? { id: { not: excludeSessionId } } : {}),
  } as const;

  // Room conflict takes priority — admins can change a trainer more easily
  // than they can move a class to a different room.
  if (roomId) {
    const roomConflict = await prisma.session.findFirst({
      where: { ...overlapWhere, roomId },
      select: CONFLICT_INCLUDE,
    });
    if (roomConflict) return toConflict(roomConflict, "room");
  }

  if (trainerUserId) {
    const trainerConflict = await prisma.session.findFirst({
      where: { ...overlapWhere, trainerUserId },
      select: CONFLICT_INCLUDE,
    });
    if (trainerConflict) return toConflict(trainerConflict, "trainer");
  }

  return null;
}
