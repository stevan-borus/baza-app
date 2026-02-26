import { InviteStatus, UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;
  const { id } = await context.params;

  const invite = await prisma.userInvite.findUnique({ where: { id } });
  if (!invite) return fail("Invite not found", 404);
  if (invite.status !== InviteStatus.PENDING)
    return fail("Only pending invites can be revoked", 400);
  // Mark revoked so token can no longer be used.
  await prisma.userInvite.update({
    where: { id },
    data: { status: InviteStatus.REVOKED },
  });

  return ok({ success: true });
}
