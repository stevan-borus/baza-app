import { createCampaignInputSchema } from "@baza/types";
import { Prisma, UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { dispatchCampaign } from "@/lib/server/campaign-dispatch";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { tryCatch } from "@/lib/server/try-catch";

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, body: true, audienceSpec: true, recipientCount: true, status: true, scheduledFor: true, sentAt: true, createdAt: true },
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
    select: { id: true, title: true, status: true, scheduledFor: true, sentAt: true, recipientCount: true },
  });
  if (!scheduledFor && sendNow) {
    const sent = await dispatchCampaign(created.id);
    return ok({ campaign: { ...created, status: sent.status, sentAt: sent.sentAt, recipientCount: sent.recipientCount } });
  }
  return ok({ campaign: created });
}
