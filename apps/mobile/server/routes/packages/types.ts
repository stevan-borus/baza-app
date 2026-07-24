import {
  packageTypeInputSchema,
  packageTypeMutationResponseSchema,
  packageTypesResponseSchema,
} from "@baza/types/catalog";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { respond, fail, parseBody } from "@/lib/server/http";
import {
  PACKAGE_TYPE_CLASS_TYPES_SELECT,
  shapePackageTypeClassTypes,
} from "@/lib/server/package-type-shape";
import { prisma } from "@/lib/server/prisma";
import { ensureSystemBirthdayGift } from "@/lib/server/system-gift";

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER, UserRole.CLIENT]);
  if (!guard.ok) return guard.response;

  // Self-heal the built-in gift before the list is read, so the assign sheet and
  // notification routing always see it. Read-first inside — no write per read.
  await ensureSystemBirthdayGift(prisma);

  const packageTypes = await prisma.packageType.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      sessionCount: true,
      validityDays: true,
      lateCancelHours: true,
      price: true,
      isBirthdayGift: true,
      isSystem: true,
      ...PACKAGE_TYPE_CLASS_TYPES_SELECT,
      createdAt: true,
      updatedAt: true,
    },
  });

  return respond(packageTypesResponseSchema, {
    success: true,
    packageTypes: packageTypes.map(shapePackageTypeClassTypes),
  });
}

export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;
  // Package types define session count, validity, late-cancel policy, and the
  // covered ClassType set (a mix package when it has more than one).

  const parsed = await parseBody(request, packageTypeInputSchema);
  if (!parsed.ok) return parsed.response;

  // Every referenced ClassType must exist so we surface a 404 instead of a
  // Prisma FK error.
  const classTypeIds = Array.from(new Set(parsed.data.classTypeIds));
  const classTypeCount = await prisma.classType.count({
    where: { id: { in: classTypeIds } },
  });
  if (classTypeCount !== classTypeIds.length) {
    return fail("Class type not found", 404);
  }

  const packageType = await prisma.packageType.create({
    data: {
      name: parsed.data.name,
      sessionCount: parsed.data.sessionCount,
      validityDays: parsed.data.validityDays,
      lateCancelHours: parsed.data.lateCancelHours,
      price: parsed.data.price ?? null,
      isBirthdayGift: parsed.data.isBirthdayGift ?? false,
      classTypes: {
        create: classTypeIds.map((classTypeId) => ({ classTypeId })),
      },
    },
    select: {
      id: true,
      name: true,
      sessionCount: true,
      validityDays: true,
      lateCancelHours: true,
      price: true,
      isBirthdayGift: true,
      isSystem: true,
      ...PACKAGE_TYPE_CLASS_TYPES_SELECT,
      createdAt: true,
    },
  });

  return respond(
    packageTypeMutationResponseSchema,
    { success: true, packageType: shapePackageTypeClassTypes(packageType) },
    201,
  );
}
