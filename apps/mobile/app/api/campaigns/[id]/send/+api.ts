import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { dispatchCampaign } from "@/lib/server/campaign-dispatch";
import { fail, ok, paramFromCtxOrUrl } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";

type Ctx = { params?: Record<string, string | undefined> };

export async function POST(request: Request, ctx?: Ctx) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;
  // URL is /api/campaigns/<id>/send — the id is the segment BEFORE "send".
  const id = paramFromCtxOrUrl(request, ctx, "id", "send");
  if (!id) return fail("Missing id", 400);
  const existing = await prisma.campaign.findUnique({ where: { id }, select: { status: true } });
  if (!existing) return fail("Not found", 404);
  if (existing.status === "SENT" || existing.status === "SENDING") {
    return fail("Already sent", 409);
  }
  // dispatchCampaign claims the row atomically and returns the full
  // CAMPAIGN_SELECT shape — no re-fetch needed.
  const sent = await dispatchCampaign(id);
  return ok({ campaign: sent });
}
