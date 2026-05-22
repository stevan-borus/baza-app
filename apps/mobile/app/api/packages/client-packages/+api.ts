import { createClientPackageInputSchema } from "@baza/types";
import { NOTIFICATION_MESSAGE_KEYS } from "@baza/i18n";
import { UserRole } from "@/generated/prisma";
import { now } from "@/lib/now";
import { requireRole } from "@/lib/server/auth-guards";
import { linkPackagesToBilling } from "@/lib/server/billing-package-link";
import { fail, ok } from "@/lib/server/http";
import { createSystemNotification } from "@/lib/server/notifications";
import { findEligibleClientPackage } from "@/lib/server/package-eligibility";
import { prisma } from "@/lib/server/prisma";
import { trainerLinkedToClientProfile } from "@/lib/server/trainer-scope";
import { tryCatch } from "@/lib/server/try-catch";

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER, UserRole.CLIENT]);
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const clientProfileId = url.searchParams.get("clientProfileId");
  // Clients see only their own packages; no clientProfileId param allowed.
  if (guard.user.role === UserRole.CLIENT) {
    const ownClientProfileId = guard.user.clientProfile?.id;
    if (!ownClientProfileId) return fail("Client profile not found", 404);

    const [packages, pauses] = await Promise.all([
      prisma.clientPackage.findMany({
        where: { clientProfileId: ownClientProfileId },
        orderBy: { startsAt: "desc" },
        include: {
          packageType: {
            select: {
              id: true,
              name: true,
              sessionCount: true,
              validityDays: true,
              lateCancelHours: true,
            },
          },
        },
      }),
      prisma.packagePause.findMany({
        where: { clientProfileId: ownClientProfileId },
        select: { startsAt: true, endsAt: true },
      }),
    ]);

    // Dashboard "active package" is class-agnostic on purpose — drives the
    // home/profile pill, not the bookable calendar. Class scope is enforced at
    // booking + availability time. Here we just look for ANY eligible pack.
    const currentInstant = now();
    const activePackage = (() => {
      const distinctClassTypeIds = Array.from(
        new Set(packages.map((p: { classTypeId: string }) => p.classTypeId)),
      );
      for (const classTypeId of distinctClassTypeIds) {
        const hit = findEligibleClientPackage(
          packages.map((item: {
            id: string;
            classTypeId: string;
            startsAt: Date;
            expiresAt: Date;
            sessionsRemaining: number;
          }) => ({
            id: item.id,
            classTypeId: item.classTypeId,
            startsAt: item.startsAt,
            expiresAt: item.expiresAt,
            sessionsRemaining: item.sessionsRemaining,
          })),
          pauses,
          currentInstant,
          classTypeId,
        );
        if (hit) return hit;
      }
      return null;
    })();

    return ok({
      success: true,
      packages,
      activePackageId: activePackage?.id ?? null,
    });
  }

  // Admins may list all client packages across the studio when no clientProfileId
  // is supplied (used by /(admin)/izvestaji/paketi/aktivne-dodele assignment list).
  if (!clientProfileId) {
    if (guard.user.role !== UserRole.ADMIN) {
      return fail("clientProfileId query param is required", 400);
    }
    // Cursor-based pagination over a stable id ordering. We keep
    // `startsAt: desc` for the primary visible sort and add `id: asc` as the
    // tiebreaker so cursors stay deterministic across pages even when many
    // rows share the same startsAt instant (seed data does this).
    const search = url.searchParams.get("search")?.trim();
    const rawTake = url.searchParams.get("take");
    const parsedTake = rawTake ? parseInt(rawTake, 10) : 20;
    const take = Number.isFinite(parsedTake)
      ? Math.min(Math.max(parsedTake, 1), 100)
      : 20;
    const cursor = url.searchParams.get("cursor") ?? undefined;

    const packages = await prisma.clientPackage.findMany({
      where: search
        ? {
            clientProfile: {
              user: {
                OR: [
                  { fullName: { contains: search, mode: "insensitive" } },
                  { email: { contains: search, mode: "insensitive" } },
                ],
              },
            },
          }
        : undefined,
      orderBy: [{ startsAt: "desc" }, { id: "asc" }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        packageType: {
          select: { name: true, sessionCount: true, validityDays: true },
        },
        clientProfile: {
          select: {
            user: { select: { id: true, fullName: true, email: true } },
          },
        },
      },
    });
    const hasMore = packages.length > take;
    const pagePackages = hasMore ? packages.slice(0, take) : packages;
    const nextCursor = hasMore
      ? pagePackages[pagePackages.length - 1]?.id ?? null
      : null;
    const shaped = pagePackages.map((p) => ({
      ...p,
      client: p.clientProfile.user,
    }));
    return ok({ success: true, packages: shaped, nextCursor });
  }

  // Trainers may only view packages for clients they are linked to.
  if (guard.user.role === UserRole.TRAINER) {
    const canAccessClient = await trainerLinkedToClientProfile(guard.user.id, clientProfileId);
    if (!canAccessClient) return fail("Forbidden", 403);
  }

  // Resolve the underlying User id so we can correlate to BillingRecord
  // (which keys by clientUserId, not clientProfileId).
  const clientProfile = await prisma.clientProfile.findUnique({
    where: { id: clientProfileId },
    select: { userId: true },
  });
  if (!clientProfile) return fail("Client profile not found", 404);

  const [packages, billingRecords] = await Promise.all([
    prisma.clientPackage.findMany({
      where: { clientProfileId },
      orderBy: { startsAt: "desc" },
      include: {
        packageType: {
          select: { name: true, sessionCount: true, validityDays: true },
        },
      },
    }),
    prisma.billingRecord.findMany({
      where: {
        clientUserId: clientProfile.userId,
        status: "CONFIRMED",
      },
      select: {
        id: true,
        amount: true,
        method: true,
        packageTypeId: true,
        clientPackageId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Pair each ClientPackage with the BillingRecord that funded it. The
  // primary semantics are the explicit FK on BillingRecord.clientPackageId;
  // any leftover legacy rows (FK still NULL pending backfill) are matched
  // by the chronological-zip fallback inside linkPackagesToBilling.
  const linkMap = linkPackagesToBilling(packages, billingRecords);
  const shaped = packages.map((p) => {
    const match = linkMap.get(p.id) ?? null;
    return {
      ...p,
      billingRecord: match
        ? { amount: match.amount, method: match.method }
        : null,
    };
  });

  return ok({ success: true, packages: shaped });
}

export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;

  const bodyResult = await tryCatch(request.json());
  const body = bodyResult.error ? null : bodyResult.data;
  const parsed = createClientPackageInputSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid payload", 400, parsed.error);

  // Trainers may only create packages for clients they are linked to.
  if (guard.user.role === UserRole.TRAINER) {
    const canAccessClient = await trainerLinkedToClientProfile(
      guard.user.id,
      parsed.data.clientProfileId,
    );
    if (!canAccessClient) return fail("Forbidden", 403);
  }

  const startsAt = new Date(parsed.data.startsAt);
  if (Number.isNaN(startsAt.getTime())) return fail("Invalid startsAt date", 400);

  const packageType = await prisma.packageType.findUnique({
    where: { id: parsed.data.packageTypeId },
    select: {
      id: true,
      name: true,
      sessionCount: true,
      validityDays: true,
      classTypeId: true,
      lateCancelHours: true,
      isBirthdayGift: true,
    },
  });
  if (!packageType) return fail("Package type not found", 404);

  const expiresAt = new Date(
    startsAt.getTime() + packageType.validityDays * 24 * 60 * 60 * 1000,
  );

  const clientPackage = await prisma.clientPackage.create({
    data: {
      clientProfileId: parsed.data.clientProfileId,
      packageTypeId: parsed.data.packageTypeId,
      classTypeId: packageType.classTypeId,
      lateCancelHours: packageType.lateCancelHours,
      startsAt,
      expiresAt,
      sessionsRemaining: packageType.sessionCount,
    },
    select: {
      id: true,
      clientProfileId: true,
      packageTypeId: true,
      classTypeId: true,
      lateCancelHours: true,
      startsAt: true,
      expiresAt: true,
      sessionsRemaining: true,
    },
  });

  if (packageType.isBirthdayGift) {
    const clientProfile = await prisma.clientProfile.findUnique({
      where: { id: parsed.data.clientProfileId },
      select: { user: { select: { id: true } } },
    });
    if (clientProfile) {
      void createSystemNotification(
        clientProfile.user.id,
        NOTIFICATION_MESSAGE_KEYS.BIRTHDAY_CLIENT_GIFT,
        "BIRTHDAY_CLIENT_GIFT",
        {
          clientPackageId: clientPackage.id,
          classTypeId: packageType.classTypeId,
          packageTypeName: packageType.name,
          expiresAt: clientPackage.expiresAt.toISOString(),
        },
      );
    }
  }

  return ok({ success: true, clientPackage }, 201);
}
