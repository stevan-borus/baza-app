/** Schedule conflict detection: a session overlaps another live session
 *  iff their [startsAt, endsAt) intervals intersect AND they share either a
 *  room (when set on both) or a trainer. CANCELED sessions never block.
 */
import { prisma } from "@/lib/server/prisma";
import { SessionStatus } from "@/generated/prisma";

export type ScheduleConflict = {
  kind: "room" | "trainer";
  sessionId: string;
};

export type FindConflictArgs = {
  startsAt: Date;
  endsAt: Date;
  roomId: string | null | undefined;
  trainerUserId: string | null | undefined;
  /** Exclude a specific session (used by PATCH so we don't self-conflict). */
  excludeSessionId?: string;
};

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
      select: { id: true },
    });
    if (roomConflict) return { kind: "room", sessionId: roomConflict.id };
  }

  if (trainerUserId) {
    const trainerConflict = await prisma.session.findFirst({
      where: { ...overlapWhere, trainerUserId },
      select: { id: true },
    });
    if (trainerConflict)
      return { kind: "trainer", sessionId: trainerConflict.id };
  }

  return null;
}
