import { formatFullName } from "@baza/types/common";
import {
  createTrainerNoteResponseSchema,
  trainerNoteInputSchema,
  trainerNotesQuerySchema,
  trainerNotesResponseSchema,
} from "@baza/types/trainer-notes";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { respond, fail, parseBody } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { trainerOwnsSession } from "@/lib/server/trainer-scope";

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const parsed = trainerNotesQuerySchema.safeParse({
    sessionId: url.searchParams.get("sessionId") ?? undefined,
    clientProfileId: url.searchParams.get("clientProfileId") ?? undefined,
    sessionIds: url.searchParams.get("sessionIds") ?? undefined,
    clientProfileIds: url.searchParams.get("clientProfileIds") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
    take: url.searchParams.get("take") ?? undefined,
  });
  if (!parsed.success) return fail("Invalid query params", 400, parsed.error);

  // Plural forms take precedence over singular when both are present.
  // Singular still works for any callers that haven't migrated yet.
  const sessionFilter = parsed.data.sessionIds
    ? { sessionId: { in: parsed.data.sessionIds } }
    : parsed.data.sessionId
      ? { sessionId: parsed.data.sessionId }
      : {};
  const clientFilter = parsed.data.clientProfileIds
    ? { clientProfileId: { in: parsed.data.clientProfileIds } }
    : parsed.data.clientProfileId
      ? { clientProfileId: parsed.data.clientProfileId }
      : {};

  // Scope: trainers see only their own notes (optionally filtered by
  // session/client); admins see every note about every client. Clients
  // are not a valid caller — the role guard above rejects them with 403.
  // TrainerNotes are internal observations addressed to the studio and
  // the authoring trainer; the client is not in the audience.
  const where =
    guard.user.role === UserRole.TRAINER
      ? {
          trainerUserId: guard.user.id,
          ...sessionFilter,
          ...clientFilter,
        }
      : {
          ...sessionFilter,
          ...clientFilter,
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
          firstName: true,
          lastName: true,
        },
      },
      clientProfile: {
        select: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
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

  const shapedNotes = notes.map((n) => ({
    ...n,
    trainer: {
      id: n.trainer.id,
      fullName: formatFullName(n.trainer.firstName, n.trainer.lastName),
    },
    clientProfile: {
      ...n.clientProfile,
      user: {
        id: n.clientProfile.user.id,
        fullName: formatFullName(
          n.clientProfile.user.firstName,
          n.clientProfile.user.lastName,
        ),
      },
    },
  }));

  return respond(trainerNotesResponseSchema, {
    success: true,
    notes: shapedNotes,
    nextCursor:
      notes.length === parsed.data.take ? notes[notes.length - 1]?.id ?? null : null,
  });
}

export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;

  const parsed = await parseBody(request, trainerNoteInputSchema);
  if (!parsed.ok) return parsed.response;

  // Session is optional — a note can be free-form client context with no
  // class attached. When set, we still enforce trainer-ownership and the
  // active-booking rule so session-bound notes remain meaningful.
  const profile = await prisma.clientProfile.findUnique({
    where: { id: parsed.data.clientProfileId },
    select: { id: true },
  });
  if (!profile) return fail("Client profile not found", 404);

  // Trainer-link guard. A trainer may only write notes for clients they
  // have actually trained — i.e. who have at least one non-canceled
  // booking on one of this trainer's sessions. Without this check, a
  // session-less note would let any trainer write against any client
  // (an IDOR). Admins are exempt; they can write notes against anyone.
  if (guard.user.role === UserRole.TRAINER) {
    const link = await prisma.booking.findFirst({
      where: {
        clientProfileId: parsed.data.clientProfileId,
        canceledAt: null,
        session: { trainerUserId: guard.user.id },
      },
      select: { id: true },
    });
    if (!link) {
      return fail("You can only add notes for your own clients", 403);
    }
  }

  if (parsed.data.sessionId) {
    const session = await prisma.session.findUnique({
      where: { id: parsed.data.sessionId },
      select: { id: true },
    });
    if (!session) return fail("Session not found", 404);

    if (guard.user.role === UserRole.TRAINER) {
      const ownsSession = await trainerOwnsSession(
        guard.user.id,
        parsed.data.sessionId,
      );
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
      select: { id: true, canceledAt: true },
    });
    if (!activeBooking || activeBooking.canceledAt) {
      return fail("Client must be actively booked for this session", 409);
    }
  }

  const note = await prisma.trainerNote.create({
    data: {
      sessionId: parsed.data.sessionId ?? null,
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

  // No notification — clients don't see TrainerNotes, so telling them
  // a note was left is user-hostile (and admins want pull-not-push for
  // passive context; trainer-note activity isn't a work queue).

  return respond(createTrainerNoteResponseSchema, { success: true, note }, 201);
}
