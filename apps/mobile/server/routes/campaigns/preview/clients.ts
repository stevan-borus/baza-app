import {
  campaignAudienceClientsResponseSchema,
  campaignAudienceSpecSchema,
} from "@baza/types/campaigns";
import { formatFullName } from "@baza/types/common";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { resolveCampaignAudienceMembers } from "@/lib/server/campaign-audience";
import { fail, respond } from "@/lib/server/http";
import { tryCatch } from "@/lib/server/try-catch";

/**
 * The PROJECTED audience for a spec, as people — who matches the audience
 * RIGHT NOW. Powers the "view clients" sheet in compose (and the detail screen
 * for not-yet-sent campaigns). Admin-only; returns name + email + the
 * campaignsEnabled flag so the UI can mark opted-out clients.
 */
export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;
  const bodyResult = await tryCatch(request.json());
  const parsed = campaignAudienceSpecSchema.safeParse(bodyResult.error ? null : bodyResult.data);
  if (!parsed.success) return fail("Invalid audience spec", 400, parsed.error);

  const members = await resolveCampaignAudienceMembers(parsed.data);
  return respond(campaignAudienceClientsResponseSchema, {
    clients: members.map((m) => ({
      id: m.id,
      fullName: formatFullName(m.firstName, m.lastName),
      email: m.email,
      campaignsEnabled: m.campaignsEnabled,
    })),
  });
}
