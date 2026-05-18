import { inviteClientInputSchema, type ClientPackageStatus } from "@baza/types";
import { UserRole } from "@/generated/prisma";
import { now } from "@/lib/now";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { tryCatch } from "@/lib/server/try-catch";

const EXPIRING_WINDOW_DAYS = 14;

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;

  const currentInstant = now();

  // Parse cursor + take + q from the URL. Cursor-based pagination over a
  // stable `id` ordering — we tried orderBy fullName before but couldn't
  // express that as a Prisma cursor and still get deterministic paging.
  // Search ("q") matches user.fullName or user.email case-insensitively.
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const rawTake = url.searchParams.get("take");
  const parsedTake = rawTake ? parseInt(rawTake, 10) : 20;
  const take = Number.isFinite(parsedTake)
    ? Math.min(Math.max(parsedTake, 1), 100)
    : 20;
  const q = url.searchParams.get("q")?.trim() || undefined;

  // The trainer scope (linked-via-active-booking) is preserved as-is; the
  // search filter is layered on top via AND so trainers also benefit from
  // the q-search without leaking strangers into their list.
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

  const searchWhere = q
    ? {
        OR: [
          { user: { fullName: { contains: q, mode: "insensitive" as const } } },
          { user: { email: { contains: q, mode: "insensitive" as const } } },
        ],
      }
    : undefined;

  const where =
    baseWhere && searchWhere
      ? { AND: [baseWhere, searchWhere] }
      : (baseWhere ?? searchWhere);

  // Fetch take+1 so we can tell whether there's another page without a
  // separate count query.
  const clients = await prisma.clientProfile.findMany({
    where,
    select: {
      id: true,
      notes: true,
      user: {
        select: {
          id: true,
          fullName: true,
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
  });

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
  const withStatus = pageClients.map(({ packages, packagePauses, ...rest }) => {
    if (packagePauses.length > 0) {
      return { ...rest, packageStatus: "paused" as ClientPackageStatus };
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
    return { ...rest, packageStatus: status };
  });

  return ok({ success: true, clients: withStatus, nextCursor });
}

export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const bodyResult = await tryCatch(request.json());
  const body = bodyResult.error ? null : bodyResult.data;
  const parsed = inviteClientInputSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid payload", 400, parsed.error);

  const { email, fullName, phone, dateOfBirth } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();
  // Creates user and linked clientProfile; admin-only.
  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      fullName,
      phone,
      role: "CLIENT",
      isActive: true,
      clientProfile: {
        create: { dateOfBirth: new Date(dateOfBirth) },
      },
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      phone: true,
      role: true,
      clientProfile: { select: { id: true } },
    },
  });

  return ok({ success: true, user }, 201);
}
