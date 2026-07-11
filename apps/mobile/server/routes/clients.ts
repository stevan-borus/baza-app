import { formatFullName } from "@baza/types/common";
import { clientsResponseSchema } from "@baza/types/clients";
import { type ClientPackageStatus } from "@baza/types/packages";
import { UserRole } from "@/generated/prisma";
import { now } from "@/lib/now";
import { requireRole } from "@/lib/server/auth-guards";
import { respond } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";

const EXPIRING_WINDOW_DAYS = 14;

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;

  const currentInstant = now();

  // Parse cursor + take + q from the URL. Cursor-based pagination over a
  // stable `id` ordering — we tried orderBy name before but couldn't
  // express that as a Prisma cursor and still get deterministic paging, so the
  // lastName index exists for future use but ordering stays on id here.
  // Search ("q") is tokenized on whitespace; each token must match
  // user.firstName, user.lastName or user.email case-insensitively, and the
  // tokens are ANDed together so full-name queries ("First Last") match.
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const rawTake = url.searchParams.get("take");
  const parsedTake = rawTake ? parseInt(rawTake, 10) : 20;
  const take = Number.isFinite(parsedTake)
    ? Math.min(Math.max(parsedTake, 1), 100)
    : 20;
  const q = url.searchParams.get("q")?.trim() || undefined;

  // The trainer scope (linked-via-active-booking) is preserved as-is; the
  // search filter (built below) is layered on top via AND so trainers also
  // benefit from the q-search without leaking strangers into their list.
  const baseWhere =
    guard.user.role === UserRole.TRAINER
      ? {
          bookings: {
            some: {
              canceledAt: null,
              session: { trainerUserId: guard.user.id },
            },
          },
        }
      : undefined;

  // Tokenize the query on whitespace and require EACH token to match in
  // firstName OR lastName OR email (case-insensitive), then AND the tokens
  // together. A single-string `contains` across the three columns never
  // matched "First Last" queries because the whole string was tested against
  // each single column. Per-token AND lets "active reformer" land on
  // firstName="Active"/lastName="Reformer", while a single-token query (one
  // token, e.g. an email substring "client.active") behaves exactly as before.
  const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
  const searchWhere =
    tokens.length > 0
      ? {
          AND: tokens.map((token) => ({
            OR: [
              { user: { firstName: { contains: token, mode: "insensitive" as const } } },
              { user: { lastName: { contains: token, mode: "insensitive" as const } } },
              { user: { email: { contains: token, mode: "insensitive" as const } } },
            ],
          })),
        }
      : undefined;

  // Soft-deleted clients (isActive:false) are hidden from every list — the
  // admin "delete" action is a soft-delete that flips this flag, so without
  // this filter a "deleted" client keeps showing and delete looks like a no-op.
  const activeWhere = { user: { isActive: true } };

  const where = {
    AND: [activeWhere, ...(baseWhere ? [baseWhere] : []), ...(searchWhere ? [searchWhere] : [])],
  };

  // Fetch take+1 so we can tell whether there's another page without a
  // separate count query, and count the full matching set for the tab badge.
  // `total` uses the SAME `where`, so it follows the q-search and trainer
  // scope — the badge shows "matches for the current view", not the loaded
  // page count (which used to sit at the page size until the admin scrolled).
  // Both hit Postgres, so run them concurrently rather than back-to-back.
  const [clients, total] = await Promise.all([
    prisma.clientProfile.findMany({
      where,
      select: {
        id: true,
        notes: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            isActive: true,
            createdAt: true,
          },
        },
        packages: {
          select: {
            sessionsRemaining: true,
            expiresAt: true,
          },
        },
        packagePauses: {
          where: {
            startsAt: { lte: currentInstant },
            endsAt: { gte: currentInstant },
          },
          select: { id: true },
          take: 1,
        },
      },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: "asc" },
    }),
    prisma.clientProfile.count({ where }),
  ]);

  const hasMore = clients.length > take;
  const pageClients = hasMore ? clients.slice(0, take) : clients;
  const nextCursor = hasMore
    ? pageClients[pageClients.length - 1]?.id ?? null
    : null;

  const expiringThreshold = new Date(
    currentInstant.getTime() + EXPIRING_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  // Compute the most meaningful package status per client.
  // Priority: paused (overrides) > active > expiring > expired > none.
  const withStatus = pageClients.map(({ packages, packagePauses, user, ...rest }) => {
    const userWithName = {
      ...user,
      fullName: formatFullName(user.firstName, user.lastName),
    };
    if (packagePauses.length > 0) {
      return {
        ...rest,
        user: userWithName,
        packageStatus: "paused" as ClientPackageStatus,
      };
    }

    let status: ClientPackageStatus = "none";
    let hasExpired = false;

    for (const p of packages) {
      const isExpired = p.expiresAt < currentInstant || p.sessionsRemaining <= 0;
      if (isExpired) {
        hasExpired = true;
        continue;
      }
      if (p.expiresAt <= expiringThreshold) {
        if (status !== "active") status = "expiring";
      } else {
        status = "active";
      }
    }

    if (status === "none" && hasExpired) status = "expired";
    return { ...rest, user: userWithName, packageStatus: status };
  });

  return respond(clientsResponseSchema, {
    success: true,
    clients: withStatus,
    nextCursor,
    total,
  });
}

// Adding a client is done exclusively through the invite flow (POST /api/invites),
// which creates a UserInvite + sends the activation email. There is deliberately
// no direct create route: a directly-created User has no password and no way to
// be notified, which stranded clients (they showed up as "active" but could
// never sign in). See invite-sheet.tsx / accept-invite.tsx for the real path.
