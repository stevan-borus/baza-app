import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";

export async function GET(request: Request, ctx: { params: { id: string } }) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  // Accepted documents — used for the legal panel list of "what they signed".
  // social_media is intentionally excluded here because it's a binary
  // preference, not a "document accepted" event; we read its latest value
  // separately so admins can see Da/Ne (not just absence).
  const records = await prisma.consentRecord.findMany({
    where: {
      userId: ctx.params.id,
      accepted: true,
      documentKey: { not: "social_media" },
    },
    orderBy: { acceptedAt: "desc" },
    select: {
      id: true,
      documentKey: true,
      version: true,
      acceptedAt: true,
      guardianVerifiedAt: true,
    },
  });

  // Latest social-media row regardless of value — null when the client has
  // never been asked (legacy state pre-gate).
  const socialMedia = await prisma.consentRecord.findFirst({
    where: { userId: ctx.params.id, documentKey: "social_media" },
    orderBy: { acceptedAt: "desc" },
    select: { accepted: true, acceptedAt: true },
  });

  return ok({
    records,
    socialMedia: socialMedia
      ? {
          accepted: socialMedia.accepted,
          acceptedAt: socialMedia.acceptedAt,
        }
      : null,
  });
}
