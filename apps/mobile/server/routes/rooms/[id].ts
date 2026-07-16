import {
  roomMutationResponseSchema,
  updateStudioRoomInputSchema,
} from "@baza/types/catalog";
import { successResponseSchema } from "@baza/types/common";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { respond, fail, parseBody } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";

type RouteParams = Record<string, string>;

export async function PATCH(request: Request, { id }: RouteParams) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const parsed = await parseBody(request, updateStudioRoomInputSchema);
  if (!parsed.ok) return parsed.response;

  const existing = await prisma.studioRoom.findUnique({ where: { id } });
  if (!existing) return fail("Room not found", 404);

  const room = await prisma.studioRoom.update({
    where: { id },
    data: parsed.data,
    select: {
      id: true,
      name: true,
      capacity: true,
      updatedAt: true,
    },
  });

  return respond(roomMutationResponseSchema, { success: true, room });
}

export async function DELETE(request: Request, { id }: RouteParams) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  // Refuse if any session references this room — admin must reassign or delete
  // those sessions first.
  const inUse = await prisma.session.findFirst({
    where: { roomId: id },
    select: { id: true },
  });
  if (inUse) {
    return fail(
      "Room is in use by existing sessions — cannot delete",
      409,
    );
  }

  const existing = await prisma.studioRoom.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return fail("Room not found", 404);

  await prisma.studioRoom.delete({ where: { id } });
  return respond(successResponseSchema, { success: true });
}
