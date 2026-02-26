import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";

const AUTHENTICATED_ROLES = [UserRole.ADMIN, UserRole.TRAINER, UserRole.CLIENT];

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requireRole(request, AUTHENTICATED_ROLES);
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  const notification = await prisma.notificationLog.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      readAt: true,
    },
  });
  // Privacy: users may only mark their own notifications as read.
  if (!notification || notification.userId !== guard.user.id) {
    return fail("Notification not found", 404);
  }

  const updated = await prisma.notificationLog.update({
    where: { id },
    data: { readAt: notification.readAt ?? new Date() },
    select: {
      id: true,
      readAt: true,
    },
  });

  return ok({
    success: true,
    notification: updated,
  });
}
