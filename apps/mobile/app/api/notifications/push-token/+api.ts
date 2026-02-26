import { registerPushTokenInputSchema } from "@baza/types";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { tryCatch } from "@/lib/server/try-catch";

const AUTHENTICATED_ROLES = [UserRole.ADMIN, UserRole.TRAINER, UserRole.CLIENT];

export async function POST(request: Request) {
  const guard = await requireRole(request, AUTHENTICATED_ROLES);
  if (!guard.ok) return guard.response;

  const bodyResult = await tryCatch(request.json());
  const body = bodyResult.error ? null : bodyResult.data;
  const parsed = registerPushTokenInputSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid payload", 400, parsed.error);

  // One token per user+device; updates expo token on re-register.
  const token = await prisma.pushToken.upsert({
    where: {
      userId_deviceId: {
        userId: guard.user.id,
        deviceId: parsed.data.deviceId,
      },
    },
    create: {
      userId: guard.user.id,
      deviceId: parsed.data.deviceId,
      expoPushToken: parsed.data.expoPushToken,
      isActive: true,
      lastSeenAt: new Date(),
    },
    update: {
      expoPushToken: parsed.data.expoPushToken,
      isActive: true,
      lastSeenAt: new Date(),
    },
    select: {
      id: true,
      deviceId: true,
      expoPushToken: true,
      isActive: true,
      lastSeenAt: true,
    },
  });

  // Ensure preference row exists; optionally sync app locale for notification language.
  await prisma.notificationPreference.upsert({
    where: { userId: guard.user.id },
    create: {
      userId: guard.user.id,
      ...(parsed.data.preferredLocale ? { preferredLocale: parsed.data.preferredLocale } : {}),
    },
    update: parsed.data.preferredLocale ? { preferredLocale: parsed.data.preferredLocale } : {},
  });

  return ok({
    success: true,
    token,
  });
}

export async function DELETE(request: Request) {
  const guard = await requireRole(request, AUTHENTICATED_ROLES);
  if (!guard.ok) return guard.response;

  const bodyResult = await tryCatch(request.json());
  const body =
    bodyResult.error || !bodyResult.data || typeof bodyResult.data !== "object"
      ? null
      : (bodyResult.data as { deviceId?: unknown; expoPushToken?: unknown });

  const deviceId =
    typeof body?.deviceId === "string" && body.deviceId.length > 0
      ? body.deviceId
      : undefined;
  const expoPushToken =
    typeof body?.expoPushToken === "string" && body.expoPushToken.length > 0
      ? body.expoPushToken
      : undefined;

  const result = await prisma.pushToken.updateMany({
    where: {
      userId: guard.user.id,
      ...(deviceId ? { deviceId } : {}),
      ...(expoPushToken ? { expoPushToken } : {}),
    },
    data: {
      isActive: false,
    },
  });

  return ok({
    success: true,
    deactivated: result.count,
  });
}
