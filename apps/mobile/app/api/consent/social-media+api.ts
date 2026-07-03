import { UserRole } from "@/generated/prisma";
import { socialMediaConsentInputSchema } from "@baza/types/consent";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { extractEvidence } from "@/lib/legal/evidence";
import { ACTIVE_VERSIONS } from "@/lib/legal/versions";
import { prisma } from "@/lib/server/prisma";

const AUTHENTICATED_ROLES = [UserRole.ADMIN, UserRole.TRAINER, UserRole.CLIENT];

export async function POST(request: Request) {
  const guard = await requireRole(request, AUTHENTICATED_ROLES);
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  const parsed = socialMediaConsentInputSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid payload", 400, parsed.error);

  const evidence = extractEvidence(request);

  const record = await prisma.consentRecord.create({
    data: {
      userId: guard.user.id,
      documentKey: "social_media",
      version: ACTIVE_VERSIONS.social_media,
      // requireRole does not return preferredLocale on guard.user today; hardcode the
      // spec default until that field is plumbed through getRequestUser's select.
      locale: "sr",
      accepted: parsed.data.accepted,
      ipAddress: evidence.ipAddress,
      userAgent: evidence.userAgent,
      appVersion: evidence.appVersion,
    },
    select: { id: true, accepted: true, acceptedAt: true },
  });

  return ok({ success: true, record });
}
