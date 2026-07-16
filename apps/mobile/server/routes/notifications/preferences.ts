import {
  notificationPreferenceInputSchema,
  notificationPreferencesResponseSchema,
} from "@baza/types/notifications";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { respond, parseBody } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";

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
      campaignsEnabled: true,
      bookingEmailsEnabled: true,
      preferredLocale: true,
      updatedAt: true,
    },
  });

  return respond(notificationPreferencesResponseSchema, {
    success: true,
    preferences: preference,
  });
}

export async function PATCH(request: Request) {
  const guard = await requireRole(request, AUTHENTICATED_ROLES);
  if (!guard.ok) return guard.response;

  const parsed = await parseBody(request, notificationPreferenceInputSchema);
  if (!parsed.ok) return parsed.response;

  const preference = await prisma.notificationPreference.upsert({
    where: { userId: guard.user.id },
    create: {
      userId: guard.user.id,
      pushEnabled: parsed.data.pushEnabled ?? true,
      inAppEnabled: parsed.data.inAppEnabled ?? true,
      campaignsEnabled: parsed.data.campaignsEnabled ?? true,
      bookingEmailsEnabled: parsed.data.bookingEmailsEnabled ?? true,
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
      ...(typeof parsed.data.campaignsEnabled === "boolean"
        ? { campaignsEnabled: parsed.data.campaignsEnabled }
        : {}),
      ...(typeof parsed.data.bookingEmailsEnabled === "boolean"
        ? { bookingEmailsEnabled: parsed.data.bookingEmailsEnabled }
        : {}),
      ...(parsed.data.preferredLocale !== undefined
        ? { preferredLocale: parsed.data.preferredLocale }
        : {}),
    },
    select: {
      pushEnabled: true,
      inAppEnabled: true,
      campaignsEnabled: true,
      bookingEmailsEnabled: true,
      preferredLocale: true,
      updatedAt: true,
    },
  });

  return respond(notificationPreferencesResponseSchema, {
    success: true,
    preferences: preference,
  });
}
