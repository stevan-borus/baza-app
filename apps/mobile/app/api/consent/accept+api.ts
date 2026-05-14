import { UserRole } from "@/generated/prisma";
import { consentAcceptInputSchema } from "@baza/types";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { extractEvidence } from "@/lib/legal/evidence";
import { prisma } from "@/lib/server/prisma";

const AUTHENTICATED_ROLES = [UserRole.ADMIN, UserRole.TRAINER, UserRole.CLIENT];

export async function POST(request: Request) {
  const guard = await requireRole(request, AUTHENTICATED_ROLES);
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  const parsed = consentAcceptInputSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid payload", 400, parsed.error);

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

  return ok({ success: true, record });
}
