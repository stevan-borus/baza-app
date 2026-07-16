import { UserRole } from "@/generated/prisma";
import {
  consentAcceptInputSchema,
  consentAcceptResponseSchema,
} from "@baza/types/consent";
import { requireRole } from "@/lib/server/auth-guards";
import { respond, parseBody } from "@/lib/server/http";
import { extractEvidence } from "@/lib/legal/evidence";
import { prisma } from "@/lib/server/prisma";

const AUTHENTICATED_ROLES = [UserRole.ADMIN, UserRole.TRAINER, UserRole.CLIENT];

export async function POST(request: Request) {
  const guard = await requireRole(request, AUTHENTICATED_ROLES);
  if (!guard.ok) return guard.response;

  const parsed = await parseBody(request, consentAcceptInputSchema);
  if (!parsed.ok) return parsed.response;

  const { documentKey, version, locale, guardianName, guardianRelation } = parsed.data;
  const evidence = extractEvidence(request);

  const record = await prisma.consentRecord.create({
    data: {
      userId: guard.user.id,
      documentKey,
      version,
      locale,
      accepted: true,
      ipAddress: evidence.ipAddress,
      userAgent: evidence.userAgent,
      appVersion: evidence.appVersion,
      guardianName: guardianName ?? null,
      guardianRelation: guardianRelation ?? null,
    },
    select: { id: true, documentKey: true, version: true, acceptedAt: true },
  });

  return respond(consentAcceptResponseSchema, { success: true, record });
}
