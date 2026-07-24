// POST /api/packages/client-packages/[id]/add-session — admin "+1 termin".
//
// A justified absence already cost the client a session: the no-show charge
// debits sessionsRemaining at consumption time. This restores exactly that one
// session by incrementing sessionsRemaining by 1 on the still-active package,
// so an admin no longer has to hand out a throwaway 1-session package.
//
// ADMIN only (deliberately not trainers — a goodwill credit is an owner
// decision). An expired or revoked package is rejected: a dead package can't
// absorb a useful credit, and silently crediting it would mislead the admin.
import { addSessionResponseSchema } from "@baza/types/packages";
import { UserRole } from "@/generated/prisma";
import { now } from "@/lib/now";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, respond } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";

type RouteParams = Record<string, string>;

export async function POST(request: Request, { id }: RouteParams) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const pkg = await prisma.clientPackage.findUnique({
    where: { id },
    select: { id: true, revokedAt: true, expiresAt: true },
  });
  if (!pkg) return fail("Client package not found", 404);
  if (pkg.revokedAt) return fail("Package is revoked", 409);
  if (pkg.expiresAt.getTime() <= now().getTime()) {
    return fail("Package has expired", 409);
  }

  const updated = await prisma.clientPackage.update({
    where: { id: pkg.id },
    data: { sessionsRemaining: { increment: 1 } },
    select: { id: true, sessionsRemaining: true },
  });

  return respond(addSessionResponseSchema, {
    success: true,
    clientPackage: updated,
  });
}
