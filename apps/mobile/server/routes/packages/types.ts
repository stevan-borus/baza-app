import {
  packageTypeInputSchema,
  packageTypeMutationResponseSchema,
  packageTypesResponseSchema,
} from "@baza/types/catalog";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { respond, fail, parseBody } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER, UserRole.CLIENT]);
  if (!guard.ok) return guard.response;

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
      classTypeId: true,
      classType: { select: { id: true, name: true } },
      createdAt: true,
      updatedAt: true,
    },
  });

  return respond(packageTypesResponseSchema, { success: true, packageTypes });
}

export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;
  // Package types define session count, validity, and late-cancel policy.

  const parsed = await parseBody(request, packageTypeInputSchema);
  if (!parsed.ok) return parsed.response;

  // classTypeId is required — confirm the referenced ClassType exists so we
  // surface a 404 instead of a Prisma FK error.
  const classType = await prisma.classType.findUnique({
    where: { id: parsed.data.classTypeId },
    select: { id: true },
  });
  if (!classType) return fail("Class type not found", 404);

  const packageType = await prisma.packageType.create({
    data: {
      name: parsed.data.name,
      sessionCount: parsed.data.sessionCount,
      validityDays: parsed.data.validityDays,
      lateCancelHours: parsed.data.lateCancelHours,
      price: parsed.data.price ?? null,
      classTypeId: parsed.data.classTypeId,
      isBirthdayGift: parsed.data.isBirthdayGift ?? false,
    },
    select: {
      id: true,
      name: true,
      sessionCount: true,
      validityDays: true,
      lateCancelHours: true,
      price: true,
      classTypeId: true,
      isBirthdayGift: true,
      classType: { select: { id: true, name: true } },
      createdAt: true,
    },
  });

  return respond(
    packageTypeMutationResponseSchema,
    { success: true, packageType },
    201,
  );
}
