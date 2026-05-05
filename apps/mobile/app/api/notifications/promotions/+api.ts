import { createPromotionCampaignInputSchema } from "@baza/types";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { createAndDispatchUserNotification } from "@/lib/server/notifications";
import { prisma } from "@/lib/server/prisma";
import { tryCatch } from "@/lib/server/try-catch";

export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;
  // Promotions go to every client with in-app notifications enabled — there
  // is no marketing-specific opt-out. Users who turn in-app off get nothing.

  const bodyResult = await tryCatch(request.json());
  const body = bodyResult.error ? null : bodyResult.data;
  const parsed = createPromotionCampaignInputSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid payload", 400, parsed.error);

  const recipients = await prisma.notificationPreference.findMany({
    where: { inAppEnabled: true },
    select: { userId: true },
  });

  await Promise.all(
    recipients.map((entry: { userId: string }) =>
      createAndDispatchUserNotification({
        userId: entry.userId,
        type: "GENERAL",
        title: parsed.data.title,
        body: parsed.data.body,
        payload: parsed.data.payload,
      }),
    ),
  );

  return ok({
    success: true,
    recipients: recipients.length,
  });
}
