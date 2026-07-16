import {
  roomMutationResponseSchema,
  roomsResponseSchema,
  studioRoomInputSchema,
} from "@baza/types/catalog";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { respond, parseBody } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;
  const rooms = await prisma.studioRoom.findMany({ orderBy: { name: "asc" } });
  return respond(roomsResponseSchema, { success: true, rooms });
}

export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;
  const parsed = await parseBody(request, studioRoomInputSchema);
  if (!parsed.ok) return parsed.response;

  const room = await prisma.studioRoom.create({
    data: parsed.data,
  });
  return respond(roomMutationResponseSchema, { success: true, room }, 201);
}
