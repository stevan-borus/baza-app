import {
  classTypeMutationResponseSchema,
  updateClassTypeInputSchema,
} from "@baza/types/catalog";
import { successResponseSchema } from "@baza/types/common";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { respond, fail, parseBody } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";

type RouteParams = Record<string, string>;

export async function PATCH(request: Request, { id }: RouteParams) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const parsed = await parseBody(request, updateClassTypeInputSchema);
  if (!parsed.ok) return parsed.response;

  const existing = await prisma.classType.findUnique({ where: { id } });
  if (!existing) return fail("Class type not found", 404);

  const classType = await prisma.classType.update({
    where: { id },
    data: parsed.data,
    select: {
      id: true,
      name: true,
      maxClients: true,
      durationMins: true,
      emptyBookingCutoffHours: true,
      updatedAt: true,
    },
  });

  return respond(classTypeMutationResponseSchema, {
    success: true,
    classType,
  });
}

export async function DELETE(request: Request, { id }: RouteParams) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  // Refuse if any PackageType set, ClientPackage snapshot, or Session
  // references this class type — admin must remove or reassign dependents
  // first. ClientPackage snapshots matter independently of SKUs: an owned
  // package can cover a ClassType no SKU references anymore.
  const [packageTypeInUse, clientPackageInUse, sessionInUse] = await Promise.all([
    prisma.packageTypeClassType.findFirst({
      where: { classTypeId: id },
      select: { packageTypeId: true },
    }),
    prisma.clientPackageClassType.findFirst({
      where: { classTypeId: id },
      select: { clientPackageId: true },
    }),
    prisma.session.findFirst({
      where: { classTypeId: id },
      select: { id: true },
    }),
  ]);
  if (packageTypeInUse || clientPackageInUse || sessionInUse) {
    return fail(
      "Class type is in use by existing package types, client packages, or sessions — cannot delete",
      409,
    );
  }

  const existing = await prisma.classType.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return fail("Class type not found", 404);

  await prisma.classType.delete({ where: { id } });
  return respond(successResponseSchema, { success: true });
}
