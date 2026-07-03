import {
  campaignResponseSchema,
  campaignsListResponseSchema,
  createCampaignInputSchema,
} from "@baza/types/campaigns";
import { Prisma, UserRole } from "@/generated/prisma";
import { now } from "@/lib/now";
import { requireRole } from "@/lib/server/auth-guards";
import { dispatchCampaign } from "@/lib/server/campaign-dispatch";
import { CAMPAIGN_SELECT } from "@/lib/server/campaign-select";
import { fail, respond } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { tryCatch } from "@/lib/server/try-catch";

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    select: CAMPAIGN_SELECT,
  });
  return respond(campaignsListResponseSchema, { campaigns });
}

export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;
  const bodyResult = await tryCatch(request.json());
  const parsed = createCampaignInputSchema.safeParse(bodyResult.error ? null : bodyResult.data);
  if (!parsed.success) return fail("Invalid payload", 400, parsed.error);
  const { title, body, audienceSpec, scheduledFor, sendNow } = parsed.data;
  // A past scheduledFor would be picked up by the very next cron tick — a
  // surprise immediate send that skips the review window. Reject it; the admin
  // can use sendNow for an intentional immediate dispatch.
  if (scheduledFor && new Date(scheduledFor) <= now()) {
    return fail("scheduledFor must be in the future", 400);
  }
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
    // dispatchCampaign returns the full CAMPAIGN_SELECT shape, so no re-fetch.
    const sent = await dispatchCampaign(created.id);
    return respond(campaignResponseSchema, { campaign: sent });
  }
  return respond(campaignResponseSchema, { campaign: created });
}
