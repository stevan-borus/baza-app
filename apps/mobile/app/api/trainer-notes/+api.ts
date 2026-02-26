import { trainerNoteInputSchema, trainerNotesQuerySchema } from "@baza/types";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { createSystemNotification } from "@/lib/server/notifications";
import { NOTIFICATION_MESSAGE_KEYS } from "@baza/i18n";
import { prisma } from "@/lib/server/prisma";
import { trainerOwnsSession } from "@/lib/server/trainer-scope";
import { tryCatch } from "@/lib/server/try-catch";

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER, UserRole.CLIENT]);
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const parsed = trainerNotesQuerySchema.safeParse({
    sessionId: url.searchParams.get("sessionId") ?? undefined,
    clientProfileId: url.searchParams.get("clientProfileId") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
    take: url.searchParams.get("take") ?? undefined,
  });
  if (!parsed.success) return fail("Invalid query params", 400, parsed.error);

  // Scope: clients see only their notes; trainers by session/client; admins see all.
  const where =
    guard.user.role === UserRole.CLIENT
      ? { clientProfileId: guard.user.clientProfile?.id ?? "__missing__" }
      : guard.user.role === UserRole.TRAINER
        ? {
            trainerUserId: guard.user.id,
            ...(parsed.data.sessionId ? { sessionId: parsed.data.sessionId } : {}),
            ...(parsed.data.clientProfileId ? { clientProfileId: parsed.data.clientProfileId } : {}),
          }
        : {
            ...(parsed.data.sessionId ? { sessionId: parsed.data.sessionId } : {}),
            ...(parsed.data.clientProfileId ? { clientProfileId: parsed.data.clientProfileId } : {}),
          };

  const notes = await prisma.trainerNote.findMany({
    where,
    orderBy: { createdAt: "desc" },
    // Cursor-based pagination.
    ...(parsed.data.cursor ? { cursor: { id: parsed.data.cursor }, skip: 1 } : {}),
    take: parsed.data.take,
    select: {
      id: true,
      note: true,
      createdAt: true,
      sessionId: true,
      clientProfileId: true,
      trainer: {
        select: {
          id: true,
          fullName: true,
        },
      },
      session: {
        select: {
          startsAt: true,
          endsAt: true,
        },
      },
    },
  });

  return ok({
    success: true,
    notes,
    nextCursor:
      notes.length === parsed.data.take ? notes[notes.length - 1]?.id ?? null : null,
  });
}

export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;

  const bodyResult = await tryCatch(request.json());
  const body = bodyResult.error ? null : bodyResult.data;
  const parsed = trainerNoteInputSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid payload", 400, parsed.error);

  const [session, profile] = await Promise.all([
    prisma.session.findUnique({
      where: { id: parsed.data.sessionId },
      select: { id: true },
    }),
    prisma.clientProfile.findUnique({
      where: { id: parsed.data.clientProfileId },
      select: {
        id: true,
        userId: true,
      },
    }),
  ]);

  if (!session) return fail("Session not found", 404);
  if (!profile) return fail("Client profile not found", 404);
  // Trainers may only add notes for sessions they are assigned to.
  if (guard.user.role === UserRole.TRAINER) {
    const ownsSession = await trainerOwnsSession(guard.user.id, parsed.data.sessionId);
    if (!ownsSession) {
      return fail("Trainers can only add notes for their own sessions", 403);
    }
  }

  const activeBooking = await prisma.booking.findUnique({
    where: {
      sessionId_clientProfileId: {
        sessionId: parsed.data.sessionId,
        clientProfileId: parsed.data.clientProfileId,
      },
    },
    select: {
      id: true,
      canceledAt: true,
    },
  });
  // Notes are only allowed for clients with an active (non-canceled) booking.
  if (!activeBooking || activeBooking.canceledAt) {
    return fail("Client must be actively booked for this session", 409);
  }

  const note = await prisma.trainerNote.create({
    data: {
      sessionId: parsed.data.sessionId,
      clientProfileId: parsed.data.clientProfileId,
      trainerUserId: guard.user.id,
      note: parsed.data.note.trim(),
    },
    select: {
      id: true,
      sessionId: true,
      clientProfileId: true,
      trainerUserId: true,
      note: true,
      createdAt: true,
    },
  });

  // Fire-and-forget; client is notified of new note.
  void createSystemNotification(profile.userId, NOTIFICATION_MESSAGE_KEYS.TRAINER_NOTE, "TRAINER_NOTE", {
    noteId: note.id,
    sessionId: note.sessionId,
  });

  return ok({ success: true, note }, 201);
}
