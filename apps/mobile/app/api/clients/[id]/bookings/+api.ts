import { formatFullName } from "@baza/types/common";
import { UserRole } from "@/generated/prisma";
import { now } from "@/lib/now";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { trainerLinkedToClientProfile } from "@/lib/server/trainer-scope";

type RouteParams = Record<string, string>;

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

  // Period filter expressed on the joined session, plus the booking's own
  // canceledAt column.
  const periodWhere = period === "upcoming"
    ? {
        canceledAt: null,
        session: { startsAt: { gte: currentInstant } },
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
      session: {
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
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

  const bookings = page.map((b) => ({
    id: b.id,
    status: b.canceledAt ? ("CANCELED" as const) : ("CONFIRMED" as const),
    bookedAt: b.createdAt.toISOString(),
    canceledAt: b.canceledAt ? b.canceledAt.toISOString() : null,
    session: {
      id: b.session.id,
      startsAt: b.session.startsAt.toISOString(),
      endsAt: b.session.endsAt.toISOString(),
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

  return ok({ success: true, bookings, nextCursor });
}
