import { createClientPackageInputSchema } from "@baza/types";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
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
            select: { name: true, sessionCount: true, validityDays: true },
          },
        },
      }),
      prisma.packagePause.findMany({
        where: { clientProfileId: ownClientProfileId },
        select: { startsAt: true, endsAt: true },
      }),
    ]);

    const activePackage = findEligibleClientPackage(
      packages.map((item: { id: string; startsAt: Date; expiresAt: Date; sessionsRemaining: number }) => ({
        id: item.id,
        startsAt: item.startsAt,
        expiresAt: item.expiresAt,
        sessionsRemaining: item.sessionsRemaining,
      })),
      pauses,
      new Date(),
    );

    return ok({
      success: true,
      packages,
      activePackageId: activePackage?.id ?? null,
    });
  }

  if (!clientProfileId) return fail("clientProfileId query param is required", 400);
  // Trainers may only view packages for clients they are linked to.
  if (guard.user.role === UserRole.TRAINER) {
    const canAccessClient = await trainerLinkedToClientProfile(guard.user.id, clientProfileId);
    if (!canAccessClient) return fail("Forbidden", 403);
  }

  const packages = await prisma.clientPackage.findMany({
    where: { clientProfileId },
    orderBy: { startsAt: "desc" },
    include: {
      packageType: {
        select: { name: true, sessionCount: true, validityDays: true },
      },
    },
  });

  return ok({ success: true, packages });
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
      sessionCount: true,
      validityDays: true,
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
      startsAt,
      expiresAt,
      sessionsRemaining: packageType.sessionCount,
    },
    select: {
      id: true,
      clientProfileId: true,
      packageTypeId: true,
      startsAt: true,
      expiresAt: true,
      sessionsRemaining: true,
    },
  });

  return ok({ success: true, clientPackage }, 201);
}
