import { createCampaignInputSchema } from "@baza/types";
import { Prisma, UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { dispatchCampaign } from "@/lib/server/campaign-dispatch";
import { CAMPAIGN_SELECT } from "@/lib/server/campaign-select";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { tryCatch } from "@/lib/server/try-catch";

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    select: CAMPAIGN_SELECT,
  });
  return ok({ campaigns });
}

export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;
  const bodyResult = await tryCatch(request.json());
  const parsed = createCampaignInputSchema.safeParse(bodyResult.error ? null : bodyResult.data);
  if (!parsed.success) return fail("Invalid payload", 400, parsed.error);
  const { title, body, audienceSpec, scheduledFor, sendNow } = parsed.data;
  const status = scheduledFor ? "SCHEDULED" : "DRAFT";
  const created = await prisma.campaign.create({
    data: {
      createdByUserId: guard.user.id,
      title,
      body,
      audienceSpec: audienceSpec as Prisma.InputJsonValue,
      status,
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
    },
    select: CAMPAIGN_SELECT,
  });
  if (!scheduledFor && sendNow) {
    await dispatchCampaign(created.id);
    // Re-fetch so the response is the same full shape as every other
    // single-campaign endpoint (dispatch returns only its mutated fields).
    const sent = await prisma.campaign.findUniqueOrThrow({ where: { id: created.id }, select: CAMPAIGN_SELECT });
    return ok({ campaign: sent });
  }
  return ok({ campaign: created });
}
