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

  // Trainers see only clients with active bookings in their sessions.
  const clients = await prisma.clientProfile.findMany({
    where:
      guard.user.role === UserRole.TRAINER
        ? {
            bookings: {
              some: {
                canceledAt: null,
                session: {
                  trainerUserId: guard.user.id,
                },
              },
            },
          }
        : undefined,
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
    orderBy: { user: { fullName: "asc" } },
  });

  const expiringThreshold = new Date(
    currentInstant.getTime() + EXPIRING_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  // Compute the most meaningful package status per client.
  // Priority: paused (overrides) > active > expiring > expired > none.
  const withStatus = clients.map(({ packages, packagePauses, ...rest }) => {
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

  return ok({ success: true, clients: withStatus });
}

export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const bodyResult = await tryCatch(request.json());
  const body = bodyResult.error ? null : bodyResult.data;
  const parsed = inviteClientInputSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid payload", 400, parsed.error);

  const { email, fullName, phone } = parsed.data;
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
        create: {},
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
