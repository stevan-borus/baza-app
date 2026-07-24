import {
  packageTypeMutationResponseSchema,
  updatePackageTypeInputSchema,
} from "@baza/types/catalog";
import { successResponseSchema } from "@baza/types/common";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { respond, fail, parseBody } from "@/lib/server/http";
import {
  PACKAGE_TYPE_CLASS_TYPES_SELECT,
  shapePackageTypeClassTypes,
} from "@/lib/server/package-type-shape";
import { prisma } from "@/lib/server/prisma";

type RouteParams = Record<string, string>;

export async function PATCH(request: Request, { id }: RouteParams) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const parsed = await parseBody(request, updatePackageTypeInputSchema);
  if (!parsed.ok) return parsed.response;

  const existing = await prisma.packageType.findUnique({ where: { id } });
  if (!existing) return fail("Package type not found", 404);
  // The built-in gift is app-managed — never editable through the catalog.
  if (existing.isSystem) {
    return fail("This package type is managed by the system and cannot be edited", 409);
  }

  const classTypeIds = parsed.data.classTypeIds
    ? Array.from(new Set(parsed.data.classTypeIds))
    : undefined;
  if (classTypeIds) {
    const classTypeCount = await prisma.classType.count({
      where: { id: { in: classTypeIds } },
    });
    if (classTypeCount !== classTypeIds.length) {
      return fail("Class type not found", 404);
    }
  }

  const { classTypeIds: _ignored, ...scalarData } = parsed.data;
  // Replacing the covered set only affects FUTURE activations — existing
  // ClientPackages snapshotted their own set and keep it.
  const packageType = await prisma.packageType.update({
    where: { id },
    data: {
      ...scalarData,
      ...(classTypeIds
        ? {
            classTypes: {
              deleteMany: {},
              create: classTypeIds.map((classTypeId) => ({ classTypeId })),
            },
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      sessionCount: true,
      validityDays: true,
      lateCancelHours: true,
      price: true,
      ...PACKAGE_TYPE_CLASS_TYPES_SELECT,
      isBirthdayGift: true,
      isSystem: true,
      updatedAt: true,
    },
  });

  return respond(packageTypeMutationResponseSchema, {
    success: true,
    packageType: shapePackageTypeClassTypes(packageType),
  });
}

export async function DELETE(request: Request, { id }: RouteParams) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;
  // The built-in gift is app-managed — never deletable through the catalog.
  const target = await prisma.packageType.findUnique({
    where: { id },
    select: { isSystem: true },
  });
  if (target?.isSystem) {
    return fail("This package type is managed by the system and cannot be deleted", 409);
  }
  // Refuse deletion if any client package references this type.
  const inUse = await prisma.clientPackage.findFirst({
    where: { packageTypeId: id },
    select: { id: true },
  });
  if (inUse) {
    return fail(
      "Package type is in use by existing client packages — cannot delete",
      409,
    );
  }
  await prisma.packageType.delete({ where: { id } });
  return respond(successResponseSchema, { success: true });
}
