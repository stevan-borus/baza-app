import { packageTypeInputSchema } from "@baza/types";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { tryCatch } from "@/lib/server/try-catch";

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
      isBirthdayGift: true,
      classTypeId: true,
      classType: { select: { id: true, name: true } },
      createdAt: true,
      updatedAt: true,
    },
  });

  return ok({ success: true, packageTypes });
}

export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;
  // Package types define session count, validity, and late-cancel policy.

  const bodyResult = await tryCatch(request.json());
  const body = bodyResult.error ? null : bodyResult.data;
  const parsed = packageTypeInputSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid payload", 400, parsed.error);

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
      classTypeId: parsed.data.classTypeId,
      isBirthdayGift: parsed.data.isBirthdayGift ?? false,
    },
    select: {
      id: true,
      name: true,
      sessionCount: true,
      validityDays: true,
      lateCancelHours: true,
      classTypeId: true,
      isBirthdayGift: true,
      classType: { select: { id: true, name: true } },
      createdAt: true,
    },
  });

  return ok({ success: true, packageType }, 201);
}
