/**
 * Marketing-consent decision.
 *
 * Writes an append-only ConsentRecord (timestamp + version + locale +
 * ip/ua/appVersion) because ZZPL čl. 15 puts the burden of demonstrating
 * consent on the controller — a bare boolean can't prove when it was given or
 * to what wording. The NotificationPreference flag is the send-time cache of
 * that record, not the record itself, so both move in one transaction.
 */
import { UserRole } from "@/generated/prisma";
import {
  marketingConsentInputSchema,
  marketingConsentResponseSchema,
} from "@baza/types/consent";
import { requireRole } from "@/lib/server/auth-guards";
import { respond, parseBody } from "@/lib/server/http";
import { extractEvidence } from "@/lib/legal/evidence";
import { ACTIVE_VERSIONS } from "@/lib/legal/versions";
import { prisma } from "@/lib/server/prisma";

const AUTHENTICATED_ROLES = [UserRole.ADMIN, UserRole.TRAINER, UserRole.CLIENT];

export async function POST(request: Request) {
  const guard = await requireRole(request, AUTHENTICATED_ROLES);
  if (!guard.ok) return guard.response;

  const parsed = await parseBody(request, marketingConsentInputSchema);
  if (!parsed.ok) return parsed.response;

  const evidence = extractEvidence(request);
  const { accepted } = parsed.data;

  const record = await prisma.$transaction(async (tx) => {
    const created = await tx.consentRecord.create({
      data: {
        userId: guard.user.id,
        documentKey: "marketing",
        version: ACTIVE_VERSIONS.marketing,
        // requireRole does not return preferredLocale on guard.user today;
        // hardcode the spec default until that field is plumbed through
        // getRequestUser's select — same as the social-media route.
        locale: "sr",
        accepted,
        ipAddress: evidence.ipAddress,
        userAgent: evidence.userAgent,
        appVersion: evidence.appVersion,
      },
      select: { id: true, accepted: true, acceptedAt: true },
    });

    await tx.notificationPreference.upsert({
      where: { userId: guard.user.id },
      update: { campaignsEnabled: accepted },
      create: { userId: guard.user.id, campaignsEnabled: accepted },
    });

    return created;
  });

  return respond(marketingConsentResponseSchema, { success: true, record });
}
