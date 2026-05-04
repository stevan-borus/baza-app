import { notificationPreferenceInputSchema } from "@baza/types";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { tryCatch } from "@/lib/server/try-catch";

const AUTHENTICATED_ROLES = [UserRole.ADMIN, UserRole.TRAINER, UserRole.CLIENT];

export async function GET(request: Request) {
  const guard = await requireRole(request, AUTHENTICATED_ROLES);
  if (!guard.ok) return guard.response;

  // Ensure preference row exists; GET returns defaults for new users.
  const preference = await prisma.notificationPreference.upsert({
    where: { userId: guard.user.id },
    create: { userId: guard.user.id },
    update: {},
    select: {
      pushEnabled: true,
      inAppEnabled: true,
      preferredLocale: true,
      updatedAt: true,
    },
  });

  return ok({
    success: true,
    preferences: preference,
  });
}

export async function PATCH(request: Request) {
  const guard = await requireRole(request, AUTHENTICATED_ROLES);
  if (!guard.ok) return guard.response;

  const bodyResult = await tryCatch(request.json());
  const body = bodyResult.error ? null : bodyResult.data;
  const parsed = notificationPreferenceInputSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid payload", 400, parsed.error);

  const preference = await prisma.notificationPreference.upsert({
    where: { userId: guard.user.id },
    create: {
      userId: guard.user.id,
      pushEnabled: parsed.data.pushEnabled ?? true,
      inAppEnabled: parsed.data.inAppEnabled ?? true,
      preferredLocale: parsed.data.preferredLocale ?? null,
    },
    // Only update fields explicitly provided in the payload.
    update: {
      ...(typeof parsed.data.pushEnabled === "boolean"
        ? { pushEnabled: parsed.data.pushEnabled }
        : {}),
      ...(typeof parsed.data.inAppEnabled === "boolean"
        ? { inAppEnabled: parsed.data.inAppEnabled }
        : {}),
      ...(parsed.data.preferredLocale !== undefined
        ? { preferredLocale: parsed.data.preferredLocale }
        : {}),
    },
    select: {
      pushEnabled: true,
      inAppEnabled: true,
      preferredLocale: true,
      updatedAt: true,
    },
  });

  return ok({
    success: true,
    preferences: preference,
  });
}
