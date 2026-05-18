import { z } from "zod";
import { createNotificationInputSchema, paginationQuerySchema } from "@baza/types";
import { UserRole } from "@/generated/prisma";
import { now } from "@/lib/now";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { createAndDispatchUserNotification } from "@/lib/server/notifications";
import { prisma } from "@/lib/server/prisma";
import { tryCatch } from "@/lib/server/try-catch";

const AUTHENTICATED_ROLES = [UserRole.ADMIN, UserRole.TRAINER, UserRole.CLIENT];

export async function GET(request: Request) {
  const guard = await requireRole(request, AUTHENTICATED_ROLES);
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const parsedQuery = paginationQuerySchema.safeParse({
    cursor: url.searchParams.get("cursor") ?? undefined,
    take: url.searchParams.get("take") ?? undefined,
  });
  if (!parsedQuery.success) return fail("Invalid query params", 400, parsedQuery.error);

  // Cursor-based pagination; users see only their own notifications.
  const notifications = await prisma.notificationLog.findMany({
    where: { userId: guard.user.id },
    orderBy: { createdAt: "desc" },
    ...(parsedQuery.data.cursor
      ? { cursor: { id: parsedQuery.data.cursor }, skip: 1 }
      : {}),
    take: parsedQuery.data.take,
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      payload: true,
      pushSent: true,
      pushStatus: true,
      readAt: true,
      createdAt: true,
    },
  });

  return ok({
    success: true,
    notifications,
    nextCursor:
      notifications.length === parsedQuery.data.take
        ? notifications[notifications.length - 1]?.id ?? null
        : null,
  });
}

export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;

  const bodyResult = await tryCatch(request.json());
  const body = bodyResult.error ? null : bodyResult.data;
  const parsed = createNotificationInputSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid payload", 400, parsed.error);

  // Admin/trainer can send ad-hoc notifications; target must be active.
  const target = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, isActive: true },
  });
  if (!target || !target.isActive) {
    return fail("Target user not found", 404);
  }

  const notification = await createAndDispatchUserNotification({
    userId: parsed.data.userId,
    type: parsed.data.type,
    title: parsed.data.title,
    body: parsed.data.body,
    payload: parsed.data.payload,
  });

  return ok({ success: true, notification }, 201);
}

const batchMarkReadSchema = z.object({
  ids: z.array(z.string()).min(1).max(50),
});

/**
 * Bulk mark-as-read. Lives on the collection route (not a /mark-read subpath)
 * because Expo Router treats `notifications/[id]` as a dynamic catch-all that
 * intercepts `notifications/<anything>` before sibling routes are matched.
 *
 * Filters by userId in the WHERE clause — a malicious client passing other
 * users' IDs would simply not match any rows.
 */
export async function PATCH(request: Request) {
  const guard = await requireRole(request, AUTHENTICATED_ROLES);
  if (!guard.ok) return guard.response;

  const bodyResult = await tryCatch(request.json());
  const body = bodyResult.error ? null : bodyResult.data;
  const parsed = batchMarkReadSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid payload", 400, parsed.error);

  const result = await prisma.notificationLog.updateMany({
    where: {
      id: { in: parsed.data.ids },
      userId: guard.user.id,
      readAt: null,
    },
    data: { readAt: now() },
  });

  return ok({ success: true, count: result.count });
}
