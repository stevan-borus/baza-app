import {
  updateTrainerNoteInputSchema,
  updateTrainerNoteResponseSchema,
} from "@baza/types/trainer-notes";
import { successResponseSchema } from "@baza/types/common";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { respond, fail, parseBody } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";

type RouteParams = Record<string, string>;

export async function PATCH(request: Request, { id }: RouteParams) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;

  const note = await prisma.trainerNote.findUnique({
    where: { id },
    select: {
      id: true,
      trainerUserId: true,
    },
  });
  if (!note) return fail("Trainer note not found", 404);
  // Editing is authorship-bound for every role: even an admin must not
  // rewrite another person's note. (DELETE below stays admin-any —
  // removing a note that shouldn't exist is moderation, not authorship.)
  if (note.trainerUserId !== guard.user.id) {
    return fail("You can only edit your own notes", 403);
  }

  const parsed = await parseBody(request, updateTrainerNoteInputSchema);
  if (!parsed.ok) return parsed.response;

  const updated = await prisma.trainerNote.update({
    where: { id },
    data: { note: parsed.data.note.trim() },
    select: {
      id: true,
      sessionId: true,
      clientProfileId: true,
      trainerUserId: true,
      note: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return respond(updateTrainerNoteResponseSchema, {
    success: true,
    note: updated,
  });
}

export async function DELETE(request: Request, { id }: RouteParams) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;

  const note = await prisma.trainerNote.findUnique({
    where: { id },
    select: {
      id: true,
      trainerUserId: true,
    },
  });
  if (!note) return fail("Trainer note not found", 404);
  // Trainers can only delete their own notes; admins can delete any.
  if (
    guard.user.role === UserRole.TRAINER &&
    note.trainerUserId !== guard.user.id
  ) {
    return fail("Trainers can only delete their own notes", 403);
  }

  await prisma.trainerNote.delete({ where: { id } });
  return respond(successResponseSchema, { success: true });
}
