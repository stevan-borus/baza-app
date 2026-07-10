import {
  classTypeInputSchema,
  classTypeMutationResponseSchema,
  classTypesResponseSchema,
} from "@baza/types/catalog";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, respond } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { tryCatch } from "@/lib/server/try-catch";

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;
  const classTypes = await prisma.classType.findMany({ orderBy: { name: "asc" } });
  return respond(classTypesResponseSchema, { success: true, classTypes });
}

export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;
  const bodyResult = await tryCatch(request.json());
  const body = bodyResult.error ? null : bodyResult.data;
  const parsed = classTypeInputSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid payload", 400, parsed.error);

  const classType = await prisma.classType.create({
    data: parsed.data,
  });
  return respond(
    classTypeMutationResponseSchema,
    { success: true, classType },
    201,
  );
}
