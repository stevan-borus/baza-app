import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";

export async function GET(request: Request, ctx: { params: { id: string } }) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const records = await prisma.consentRecord.findMany({
    where: { userId: ctx.params.id, accepted: true },
    orderBy: { acceptedAt: "desc" },
    select: {
      id: true,
      documentKey: true,
      version: true,
      acceptedAt: true,
      guardianVerifiedAt: true,
    },
  });

  return ok({ records });
}
