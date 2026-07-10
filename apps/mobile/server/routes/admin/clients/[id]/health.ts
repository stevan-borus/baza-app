import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, paramFromCtxOrUrl, respond } from "@/lib/server/http";
import { adminClientHealthResponseSchema } from "@baza/types/clients";
import { latestIntake } from "@/lib/server/health-intake";
import { prisma } from "@/lib/server/prisma";

export async function GET(
  request: Request,
  ctx?: { params?: { id?: string } },
) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;

  const userId = paramFromCtxOrUrl(request, ctx, "id", "health");
  if (!userId) return fail("Missing client id", 400);

  const client = await prisma.user.findUnique({
    where: { id: userId },
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

  return respond(adminClientHealthResponseSchema, {
    success: true,
    intake,
    withdrawnAt: withdrawal?.withdrawnAt ?? null,
  });
}
