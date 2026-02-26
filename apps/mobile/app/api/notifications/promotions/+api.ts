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
  // Marketing campaigns only target users who opted in and have in-app enabled.

  const bodyResult = await tryCatch(request.json());
  const body = bodyResult.error ? null : bodyResult.data;
  const parsed = createPromotionCampaignInputSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid payload", 400, parsed.error);

  const optedInUsers = await prisma.notificationPreference.findMany({
    where: { marketingOptIn: true, inAppEnabled: true },
    select: { userId: true },
  });

  await Promise.all(
    optedInUsers.map((entry: { userId: string }) =>
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
    recipients: optedInUsers.length,
  });
}
