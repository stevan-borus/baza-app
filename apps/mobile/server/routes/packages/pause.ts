import {
  packagePauseInputSchema,
  packagePauseResponseSchema,
} from "@baza/types/packages";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { respond, fail, parseBody } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { trainerLinkedToClientProfile } from "@/lib/server/trainer-scope";

export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;

  const parsed = await parseBody(request, packagePauseInputSchema);
  if (!parsed.ok) return parsed.response;

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

  return respond(packagePauseResponseSchema, { success: true, pause }, 201);
}
