import {
  classTypeInputSchema,
  classTypeMutationResponseSchema,
  classTypesResponseSchema,
} from "@baza/types/catalog";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { respond, parseBody } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;
  const classTypes = await prisma.classType.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      maxClients: true,
      durationMins: true,
      trialSessionValue: true,
    },
  });
  return respond(classTypesResponseSchema, { success: true, classTypes });
}

export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;
  const parsed = await parseBody(request, classTypeInputSchema);
  if (!parsed.ok) return parsed.response;

  const classType = await prisma.classType.create({
    data: parsed.data,
    select: {
      id: true,
      name: true,
      maxClients: true,
      durationMins: true,
      trialSessionValue: true,
    },
  });
  return respond(
    classTypeMutationResponseSchema,
    { success: true, classType },
    201,
  );
}
