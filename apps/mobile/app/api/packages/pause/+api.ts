import { packagePauseInputSchema } from "@baza/types/packages";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { trainerLinkedToClientProfile } from "@/lib/server/trainer-scope";
import { tryCatch } from "@/lib/server/try-catch";

export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;

  const bodyResult = await tryCatch(request.json());
  const body = bodyResult.error ? null : bodyResult.data;
  const parsed = packagePauseInputSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid payload", 400, parsed.error);

  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(parsed.data.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    return fail("Invalid pause range", 400);
  }

  // Trainers may only pause packages for clients they are linked to.
  if (guard.user.role === UserRole.TRAINER) {
    const canAccessClient = await trainerLinkedToClientProfile(
      guard.user.id,
      parsed.data.clientProfileId,
    );
    if (!canAccessClient) return fail("Forbidden", 403);
  }

  const pause = await prisma.packagePause.create({
    data: {
      clientProfileId: parsed.data.clientProfileId,
      startsAt,
      endsAt,
      reason: parsed.data.reason,
    },
    select: {
      id: true,
      clientProfileId: true,
      startsAt: true,
      endsAt: true,
      reason: true,
    },
  });

  return ok({ success: true, pause }, 201);
}
