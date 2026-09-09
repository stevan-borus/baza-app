import { unlockUserResponseSchema } from "@baza/types/admin-users";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, respond } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { clearSignInLock } from "@/lib/server/sign-in-lock";

type RouteParams = Record<string, string>;

/**
 * Lifts a sign-in lock for any role, including CLIENT. Idempotent: unlocking
 * an unlocked User is a no-op that still answers 200.
 */
export async function POST(request: Request, { id }: RouteParams) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!user) return fail("User not found", 404);

  await clearSignInLock(user.id);

  return respond(unlockUserResponseSchema, {
    success: true,
    user: { id: user.id, lockedUntil: null },
  });
}
