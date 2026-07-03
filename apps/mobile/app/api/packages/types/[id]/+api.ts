import {
  packageTypeMutationResponseSchema,
  updatePackageTypeInputSchema,
} from "@baza/types/catalog";
import { successResponseSchema } from "@baza/types/common";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, respond } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { tryCatch } from "@/lib/server/try-catch";

type RouteParams = Record<string, string>;

export async function PATCH(request: Request, { id }: RouteParams) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const bodyResult = await tryCatch(request.json());
  const body = bodyResult.error ? null : bodyResult.data;
  const parsed = updatePackageTypeInputSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid payload", 400, parsed.error);

  const existing = await prisma.packageType.findUnique({ where: { id } });
  if (!existing) return fail("Package type not found", 404);

  if (parsed.data.classTypeId) {
    const classType = await prisma.classType.findUnique({
      where: { id: parsed.data.classTypeId },
      select: { id: true },
    });
    if (!classType) return fail("Class type not found", 404);
  }

  const packageType = await prisma.packageType.update({
    where: { id },
    data: parsed.data,
    select: {
      id: true,
      name: true,
      sessionCount: true,
      validityDays: true,
      lateCancelHours: true,
      classTypeId: true,
      classType: { select: { id: true, name: true } },
      isBirthdayGift: true,
      updatedAt: true,
    },
  });

  return respond(packageTypeMutationResponseSchema, {
    success: true,
    packageType,
  });
}

export async function DELETE(request: Request, { id }: RouteParams) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;
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
