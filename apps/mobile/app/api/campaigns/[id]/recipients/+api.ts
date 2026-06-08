import { campaignAudienceSpecSchema, formatFullName } from "@baza/types";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { resolveCampaignAudienceMembers } from "@/lib/server/campaign-audience";
import { fail, ok, paramFromCtxOrUrl } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";

type Ctx = { params?: Record<string, string | undefined> };

/**
 * The clients for a campaign.
 *
 *   - SENT: the ACTUAL recipients — the users with a NotificationLog row for
 *     this campaign (opted-out clients were filtered before dispatch, so these
 *     all `campaignsEnabled: true`). Accurate even if the audience has since
 *     changed.
 *   - DRAFT / SCHEDULED / SENDING: the PROJECTED audience — re-resolve the saved
 *     spec now, including opted-out clients flagged so the admin sees the gap.
 */
export async function GET(request: Request, ctx?: Ctx) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;
  const id = paramFromCtxOrUrl(request, ctx, "id", "recipients");
  if (!id) return fail("Missing id", 400);

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    select: { status: true, audienceSpec: true },
  });
  if (!campaign) return fail("Not found", 404);

  if (campaign.status === "SENT") {
    const logs = await prisma.notificationLog.findMany({
      where: { campaignId: id },
      select: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    const clients = logs
      .map((l) => l.user)
      .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
      .map((u) => ({
        id: u.id,
        fullName: formatFullName(u.firstName, u.lastName),
        email: u.email,
        campaignsEnabled: true,
      }));
    return ok({ actual: true, clients });
  }

  // Not yet sent — project from the saved spec.
  const spec = campaignAudienceSpecSchema.parse(campaign.audienceSpec);
  const members = await resolveCampaignAudienceMembers(spec);
  return ok({
    actual: false,
    clients: members.map((m) => ({
      id: m.id,
      fullName: formatFullName(m.firstName, m.lastName),
      email: m.email,
      campaignsEnabled: m.campaignsEnabled,
    })),
  });
}
