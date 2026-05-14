import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { now } from "@/lib/now";
import { prisma } from "@/lib/server/prisma";

export async function POST(
  request: Request,
  ctx: { params: { id: string } },
) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const waiver = await prisma.consentRecord.findFirst({
    where: {
      userId: ctx.params.id,
      documentKey: "waiver_minor",
      accepted: true,
    },
    orderBy: { acceptedAt: "desc" },
    select: { id: true },
  });
  if (!waiver) return fail("No minor waiver record for this client", 404);

  await prisma.consentRecord.update({
    where: { id: waiver.id },
    data: {
      guardianVerifiedAt: now(),
      guardianVerifiedById: guard.user.id,
    },
  });

  return ok({ success: true });
}
