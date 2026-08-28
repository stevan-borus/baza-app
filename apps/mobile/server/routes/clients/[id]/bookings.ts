import {
  clientBookingOutcomeSchema,
  clientBookingsResponseSchema,
  type ClientBookingOutcome,
} from "@baza/types/bookings";
import { formatFullName } from "@baza/types/common";
import { UserRole } from "@/generated/prisma";
import { now } from "@/lib/now";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, respond } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { trainerLinkedToClientProfile } from "@/lib/server/trainer-scope";

type RouteParams = Record<string, string>;

/** Which of `sessionIds` this client holds a SessionConsumption row for. */
async function consumedSessionIdsFor(
  clientProfileId: string,
  sessionIds: string[],
): Promise<Set<string>> {
  if (sessionIds.length === 0) return new Set();
  const rows = await prisma.sessionConsumption.findMany({
    where: { clientProfileId, sessionId: { in: sessionIds } },
    select: { sessionId: true },
  });
  return new Set(rows.map((row) => row.sessionId));
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * Returns a single client's bookings, filtered by period.
 *
 * - `upcoming`: `session.startsAt >= now` AND `canceledAt is null`, ASC by startsAt.
 * - `past`: `session.startsAt < now` OR `canceledAt is not null`, DESC by startsAt.
 *
 * Booking state is derived from the Booking.canceledAt column (the schema has
 * no BookingStatus enum) — the response shape exposes a CONFIRMED | CANCELED
 * status so the UI doesn't have to know about that.
 *
 * `outcome` narrows `past` for the client's Održani / Otkazani tabs. It is a
 * SERVER-side filter on purpose: the list is cursor-paginated, so dropping
 * rows in the UI would hand the user short and inconsistent pages.
 *
 * ── "Did this cancellation cost a session?" ────────────────────────────────
 * The answer is the presence of a SessionConsumption row for
 * (clientProfileId, sessionId), not a recomputation of the late-cancel window.
 * `applyLateCancelForfeit` writes that row at exactly the moment the forfeit
 * lands, and returns early — writing nothing — for both an early cancel and an
 * admin charge waiver, so the row IS the fact rather than a proxy for it.
 * Recomputing `shouldApplyLateCancelPenalty` instead would be wrong twice
 * over: `Booking.clientPackageId` is `onDelete: SetNull`, so a deleted package
 * drops `lateCancelHours` to 0 and retroactively reclassifies every past
 * forfeit as "early"; and a waived cancel is late by the clock yet cost the
 * client nothing. `waivedByUserId` therefore needs no separate check — a
 * waiver simply never produced a row.
 *
 * The row alone is not sufficient either: `cron:sessions` writes one for a
 * no-show too. So `canceled` requires BOTH `canceledAt is not null` AND a
 * consumption row.
 */
export async function GET(request: Request, { id }: RouteParams) {
  const guard = await requireRole(request, [
    UserRole.ADMIN,
    UserRole.TRAINER,
    UserRole.CLIENT,
  ]);
  if (!guard.ok) return guard.response;

  // Self-access only for clients: a CLIENT may read /clients/<their userId>
  // but not anyone else's. Guards against the obvious IDOR where a logged-in
  // client passes another userId in the path.
  if (guard.user.role === UserRole.CLIENT && guard.user.id !== id) {
    return fail("Forbidden", 403);
  }

  const url = new URL(request.url);
  const period = url.searchParams.get("period");
  if (period !== "upcoming" && period !== "past") {
    return fail("Invalid 'period' (must be 'upcoming' or 'past')", 400);
  }

  const outcomeParam = url.searchParams.get("outcome");
  let outcome: ClientBookingOutcome | null = null;
  if (outcomeParam !== null) {
    if (period !== "past") {
      return fail("'outcome' is only valid with period=past", 400);
    }
    const parsed = clientBookingOutcomeSchema.safeParse(outcomeParam);
    if (!parsed.success) {
      return fail("Invalid 'outcome' (must be 'attended' or 'canceled')", 400);
    }
    outcome = parsed.data;
  }

  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limitParam = url.searchParams.get("limit");
  const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : NaN;
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
    ? Math.min(parsedLimit, MAX_LIMIT)
    : DEFAULT_LIMIT;

  const clientProfile = await prisma.clientProfile.findUnique({
    where: { userId: id },
    select: { id: true },
  });
  if (!clientProfile) return fail("Client not found", 404);

  if (guard.user.role === UserRole.TRAINER) {
    const allowed = await trainerLinkedToClientProfile(
      guard.user.id,
      clientProfile.id,
    );
    if (!allowed) return fail("Forbidden", 403);
  }

  const currentInstant = now();

  // Cursor pagination across a relation field: Prisma's `cursor + skip: 1`
  // doesn't work cleanly when ordering by a related table's column, so we
  // resolve the cursor row's `session.startsAt` first and use it as a `where`
  // predicate. Ties on startsAt are broken by booking.id to keep the order
  // total.
  let cursorAnchor: { startsAt: Date; bookingId: string } | null = null;
  if (cursor) {
    const cursorRow = await prisma.booking.findUnique({
      where: { id: cursor },
      select: { id: true, session: { select: { startsAt: true } } },
    });
    if (cursorRow) {
      cursorAnchor = { startsAt: cursorRow.session.startsAt, bookingId: cursorRow.id };
    }
  }

  // Sessions this client was actually charged for. Only needed for the
  // canceled tab; scoped to the one client so it stays a small index read.
  const consumedSessionIds =
    outcome === "canceled"
      ? (
          await prisma.sessionConsumption.findMany({
            where: { clientProfileId: clientProfile.id },
            select: { sessionId: true },
          })
        ).map((row) => row.sessionId)
      : [];

  // Period filter expressed on the joined session, plus the booking's own
  // canceledAt column.
  const periodWhere = period === "upcoming"
    ? {
        canceledAt: null,
        session: { startsAt: { gte: currentInstant } },
      }
    : outcome === "attended"
      ? {
          // Održani: it happened and they didn't cancel out of it. A no-show
          // belongs here too — the client was charged and the session ran.
          canceledAt: null,
          session: { startsAt: { lt: currentInstant } },
        }
      : outcome === "canceled"
        ? {
            // Otkazani: cancelled AND forfeited. A cancelled FUTURE session
            // qualifies — the forfeit already happened, so the client wants to
            // see it. An early or waived cancel has no consumption row and
            // drops out here.
            canceledAt: { not: null },
            sessionId: { in: consumedSessionIds },
          }
        : {
            OR: [
              { session: { startsAt: { lt: currentInstant } } },
              { canceledAt: { not: null } },
            ],
          };

  // For pagination, we want rows STRICTLY after the cursor in the chosen
  // ordering. Direction-aware: upcoming = ASC, past = DESC.
  const cursorWhere = cursorAnchor
    ? period === "upcoming"
      ? {
          OR: [
            { session: { startsAt: { gt: cursorAnchor.startsAt } } },
            {
              session: { startsAt: cursorAnchor.startsAt },
              id: { gt: cursorAnchor.bookingId },
            },
          ],
        }
      : {
          OR: [
            { session: { startsAt: { lt: cursorAnchor.startsAt } } },
            {
              session: { startsAt: cursorAnchor.startsAt },
              id: { gt: cursorAnchor.bookingId },
            },
          ],
        }
    : {};

  const where = {
    clientProfileId: clientProfile.id,
    AND: [periodWhere, cursorWhere],
  };

  const direction: "asc" | "desc" = period === "upcoming" ? "asc" : "desc";
  const orderBy = [
    { session: { startsAt: direction } },
    { id: "asc" as const },
  ];

  // Fetch one extra row to detect whether there's another page.
  const rows = await prisma.booking.findMany({
    where,
    orderBy,
    take: limit + 1,
    select: {
      id: true,
      createdAt: true,
      canceledAt: true,
      sessionId: true,
      session: {
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          isIntermediate: true,
          isMixedGroup: true,
          classType: { select: { id: true, name: true } },
          room: { select: { id: true, name: true } },
          trainer: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1]!.id : null;

  // The `canceled` tab already proved every row consumed; any other query has
  // to look the rows up, but only for the cancelled bookings on this page.
  const consumedOnPage =
    outcome === "canceled"
      ? new Set(page.map((b) => b.sessionId))
      : await consumedSessionIdsFor(
          clientProfile.id,
          page.filter((b) => b.canceledAt).map((b) => b.sessionId),
        );

  const bookings = page.map((b) => ({
    id: b.id,
    status: b.canceledAt ? ("CANCELED" as const) : ("CONFIRMED" as const),
    bookedAt: b.createdAt.toISOString(),
    canceledAt: b.canceledAt ? b.canceledAt.toISOString() : null,
    // Only meaningful on a cancelled row: an uncancelled past booking was
    // consumed by definition, so reporting it would be noise.
    consumedSession: b.canceledAt ? consumedOnPage.has(b.sessionId) : undefined,
    session: {
      id: b.session.id,
      startsAt: b.session.startsAt.toISOString(),
      endsAt: b.session.endsAt.toISOString(),
      isIntermediate: b.session.isIntermediate,
      isMixedGroup: b.session.isMixedGroup,
      classType: b.session.classType,
      room: b.session.room,
      trainer: b.session.trainer
        ? {
            id: b.session.trainer.id,
            fullName: formatFullName(
              b.session.trainer.firstName,
              b.session.trainer.lastName,
            ),
          }
        : null,
    },
  }));

  return respond(clientBookingsResponseSchema, {
    success: true,
    bookings,
    nextCursor,
  });
}
