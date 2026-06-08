import { updateCampaignInputSchema } from "@baza/types";
import { Prisma, UserRole } from "@/generated/prisma";
import { now } from "@/lib/now";
import { requireRole } from "@/lib/server/auth-guards";
import { CAMPAIGN_SELECT } from "@/lib/server/campaign-select";
import { fail, ok, paramFromCtxOrUrl } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { tryCatch } from "@/lib/server/try-catch";

type Ctx = { params?: Record<string, string | undefined> };

export async function GET(request: Request, ctx?: Ctx) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;
  const id = paramFromCtxOrUrl(request, ctx, "id");
  if (!id) return fail("Missing id", 400);
  const campaign = await prisma.campaign.findUnique({ where: { id }, select: CAMPAIGN_SELECT });
  if (!campaign) return fail("Not found", 404);
  return ok({ campaign });
}

export async function PATCH(request: Request, ctx?: Ctx) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;
  const id = paramFromCtxOrUrl(request, ctx, "id");
  if (!id) return fail("Missing id", 400);
  const existing = await prisma.campaign.findUnique({ where: { id }, select: { status: true, scheduledFor: true } });
  if (!existing) return fail("Not found", 404);
  if (existing.status === "SENT") return fail("Cannot edit a sent campaign", 409);
  const bodyResult = await tryCatch(request.json());
  const parsed = updateCampaignInputSchema.safeParse(bodyResult.error ? null : bodyResult.data);
  if (!parsed.success) return fail("Invalid payload", 400, parsed.error);

  // A provided scheduledFor must be in the future (a past instant would fire on
  // the next cron tick — a surprise send bypassing review).
  if (parsed.data.scheduledFor != null && new Date(parsed.data.scheduledFor) <= now()) {
    return fail("scheduledFor must be in the future", 400);
  }

  const data: Prisma.CampaignUpdateInput = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.body !== undefined) data.body = parsed.data.body;
  if (parsed.data.audienceSpec !== undefined) data.audienceSpec = parsed.data.audienceSpec as Prisma.InputJsonValue;
  if (parsed.data.scheduledFor !== undefined) data.scheduledFor = parsed.data.scheduledFor ? new Date(parsed.data.scheduledFor) : null;
  if (parsed.data.status === "DRAFT") { data.status = "DRAFT"; data.scheduledFor = null; }
  else if (parsed.data.status === "SCHEDULED") {
    // A SCHEDULED campaign the cron can act on REQUIRES a scheduledFor — either
    // supplied in this call or already on the row (and not being cleared).
    const effectiveScheduledFor =
      parsed.data.scheduledFor !== undefined
        ? parsed.data.scheduledFor
        : existing.scheduledFor;
    if (!effectiveScheduledFor) {
      return fail("A scheduled campaign needs a scheduledFor", 400);
    }
    data.status = "SCHEDULED";
  }
  const campaign = await prisma.campaign.update({ where: { id }, data, select: CAMPAIGN_SELECT });
  return ok({ campaign });
}

export async function DELETE(request: Request, ctx?: Ctx) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;
  const id = paramFromCtxOrUrl(request, ctx, "id");
  if (!id) return fail("Missing id", 400);
  const existing = await prisma.campaign.findUnique({ where: { id }, select: { status: true } });
  if (!existing) return fail("Not found", 404);
  if (existing.status === "SENT") return fail("Cannot delete a sent campaign", 409);
  await prisma.campaign.delete({ where: { id } });
  return ok({ success: true });
}
