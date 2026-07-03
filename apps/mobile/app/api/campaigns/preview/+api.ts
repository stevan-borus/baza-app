import {
  campaignAudienceSpecSchema,
  campaignPreviewResponseSchema,
} from "@baza/types/campaigns";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { countCampaignAudience } from "@/lib/server/campaign-audience";
import { fail, respond } from "@/lib/server/http";
import { tryCatch } from "@/lib/server/try-catch";

export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;
  const bodyResult = await tryCatch(request.json());
  const parsed = campaignAudienceSpecSchema.safeParse(bodyResult.error ? null : bodyResult.data);
  if (!parsed.success) return fail("Invalid audience spec", 400, parsed.error);
  const count = await countCampaignAudience(parsed.data);
  return respond(campaignPreviewResponseSchema, { count });
}
