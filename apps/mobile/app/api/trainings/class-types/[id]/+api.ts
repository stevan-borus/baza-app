import { updateClassTypeInputSchema } from "@baza/types/catalog";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { tryCatch } from "@/lib/server/try-catch";

type RouteParams = Record<string, string>;

export async function PATCH(request: Request, { id }: RouteParams) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const bodyResult = await tryCatch(request.json());
  const body = bodyResult.error ? null : bodyResult.data;
  const parsed = updateClassTypeInputSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid payload", 400, parsed.error);

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
      updatedAt: true,
    },
  });

  return ok({ success: true, classType });
}

export async function DELETE(request: Request, { id }: RouteParams) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  // Refuse if any PackageType or Session references this class type — admin
  // must remove or reassign dependents first.
  const [packageTypeInUse, sessionInUse] = await Promise.all([
    prisma.packageType.findFirst({
      where: { classTypeId: id },
      select: { id: true },
    }),
    prisma.session.findFirst({
      where: { classTypeId: id },
      select: { id: true },
    }),
  ]);
  if (packageTypeInUse || sessionInUse) {
    return fail(
      "Class type is in use by existing package types or sessions — cannot delete",
      409,
    );
  }

  const existing = await prisma.classType.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return fail("Class type not found", 404);

  await prisma.classType.delete({ where: { id } });
  return ok({ success: true });
}
