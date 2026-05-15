import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { latestIntake } from "@/lib/server/health-intake";
import { prisma } from "@/lib/server/prisma";

export async function GET(
  request: Request,
  ctx: { params: { id: string } },
) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;

  const client = await prisma.user.findUnique({
    where: { id: ctx.params.id },
    select: { clientProfile: { select: { id: true } } },
  });
  if (!client?.clientProfile) return fail("Not found", 404);

  const [intake, withdrawal] = await Promise.all([
    latestIntake(client.clientProfile.id),
    prisma.healthIntakeWithdrawal.findFirst({
      where: { clientProfileId: client.clientProfile.id },
      orderBy: { withdrawnAt: "desc" },
    }),
  ]);

  return ok({
    success: true,
    intake,
    withdrawnAt: withdrawal?.withdrawnAt ?? null,
  });
}
