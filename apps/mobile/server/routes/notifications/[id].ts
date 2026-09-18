import {
  dismissNotificationResponseSchema,
  markNotificationReadResponseSchema,
} from "@baza/types/notifications";
import { UserRole } from "@/generated/prisma";
import { now } from "@/lib/now";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, respond } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";

const AUTHENTICATED_ROLES = [UserRole.ADMIN, UserRole.TRAINER, UserRole.CLIENT];

type RouteParams = Record<string, string>;

export async function PATCH(request: Request, { id }: RouteParams) {
  const guard = await requireRole(request, AUTHENTICATED_ROLES);
  if (!guard.ok) return guard.response;

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
    data: { readAt: notification.readAt ?? now() },
    select: {
      id: true,
      readAt: true,
    },
  });

  return respond(markNotificationReadResponseSchema, {
    success: true,
    notification: updated,
  });
}

/**
 * Soft-delete a notification from the caller's inbox. The row stays for
 * campaign history and push audit; every inbox read filters `dismissedAt`.
 */
export async function DELETE(request: Request, { id }: RouteParams) {
  const guard = await requireRole(request, AUTHENTICATED_ROLES);
  if (!guard.ok) return guard.response;

  const notification = await prisma.notificationLog.findUnique({
    where: { id },
    select: { id: true, userId: true, dismissedAt: true },
  });
  // Privacy: users may only dismiss their own notifications.
  if (!notification || notification.userId !== guard.user.id) {
    return fail("Notification not found", 404);
  }

  if (!notification.dismissedAt) {
    await prisma.notificationLog.update({
      where: { id },
      data: { dismissedAt: now() },
    });
  }

  return respond(dismissNotificationResponseSchema, { success: true });
}
