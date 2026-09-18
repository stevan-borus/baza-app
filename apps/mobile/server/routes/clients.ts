import { formatFullName } from "@baza/types/common";
import { clientsQuerySchema, clientsResponseSchema } from "@baza/types/clients";
import { UserRole } from "@/generated/prisma";
import { now } from "@/lib/now";
import { requireRole } from "@/lib/server/auth-guards";
import {
  deriveClientPackageStatus,
  expiringThresholdFrom,
} from "@/lib/server/client-package-status";
import { fail, respond } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";

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

  const parsedQuery = clientsQuerySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
  });
  if (!parsedQuery.success) return fail("Invalid status filter", 400);
  const status = parsedQuery.data.status ?? undefined;

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

  const clientSelect = {
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
      // Revoked packages grant nothing — they must not paint the client
      // chip "active" (or even "expired": the studio pulled the package,
      // the client didn't run it down).
      where: { revokedAt: null },
      select: {
        sessionsRemaining: true,
        expiresAt: true,
      },
    },
    // Half-open [startsAt, endsAt) — same bound as the detail route, so a
    // pause truncated to exactly now stops counting on BOTH surfaces at
    // once and the list chip can't disagree with the detail pill.
    packagePauses: {
      where: {
        startsAt: { lte: currentInstant },
        endsAt: { gt: currentInstant },
      },
      select: { id: true },
      take: 1,
    },
  } as const;

  const expiringThreshold = expiringThresholdFrom(currentInstant);

  type ClientRow = Awaited<
    ReturnType<typeof prisma.clientProfile.findMany<{ select: typeof clientSelect }>>
  >[number];

  function shape(row: ClientRow) {
    const { packages, packagePauses, user, ...rest } = row;
    return {
      ...rest,
      user: { ...user, fullName: formatFullName(user.firstName, user.lastName) },
      packageStatus: deriveClientPackageStatus({
        packages,
        hasActivePause: packagePauses.length > 0,
        at: currentInstant,
        expiringThreshold,
      }),
    };
  }

  let pageClients: ReturnType<typeof shape>[];
  let nextCursor: string | null;
  let total: number;

  if (status) {
    // `packageStatus` is derived in JS, so Postgres can't filter or count it.
    // The studio has under a hundred clients, so loading the whole matching
    // set and paging it in memory is cheaper than the query gymnastics — and
    // it makes "Istekli" mean every expired client, not just the ones that
    // happened to land in the first page.
    const all = await prisma.clientProfile.findMany({
      where,
      select: clientSelect,
      orderBy: { id: "asc" },
    });
    const matching = all.map(shape).filter((c) => c.packageStatus === status);
    total = matching.length;
    const offset = cursor
      ? matching.findIndex((c) => c.id === cursor) + 1
      : 0;
    const slice = matching.slice(offset, offset + take);
    pageClients = slice;
    nextCursor =
      offset + take < matching.length
        ? (slice[slice.length - 1]?.id ?? null)
        : null;
  } else {
    // Fetch take+1 so we can tell whether there's another page without a
    // separate count query, and count the full matching set for the tab badge.
    // `total` uses the SAME `where`, so it follows the q-search and trainer
    // scope — the badge shows "matches for the current view", not the loaded
    // page count (which used to sit at the page size until the admin scrolled).
    // Both hit Postgres, so run them concurrently rather than back-to-back.
    const [rows, count] = await Promise.all([
      prisma.clientProfile.findMany({
        where,
        select: clientSelect,
        take: take + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { id: "asc" },
      }),
      prisma.clientProfile.count({ where }),
    ]);
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    pageClients = page.map(shape);
    nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;
    total = count;
  }

  return respond(clientsResponseSchema, {
    success: true,
    clients: pageClients,
    nextCursor,
    total,
  });
}

// Adding a client is done exclusively through the invite flow (POST /api/invites),
// which creates a UserInvite + sends the activation email. There is deliberately
// no direct create route: a directly-created User has no password and no way to
// be notified, which stranded clients (they showed up as "active" but could
// never sign in). See invite-sheet.tsx / accept-invite.tsx for the real path.
