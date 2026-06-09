import { InviteStatus, UserRole } from "@/generated/prisma";
import { now } from "@/lib/now";
import { requireRole } from "@/lib/server/auth-guards";
import { env } from "@/lib/server/env";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { sendInviteEmail } from "@/lib/server/resend";
import { addHours, generateRawToken, hashToken } from "@/lib/server/tokens";

type RouteParams = Record<string, string>;

export async function POST(request: Request, { id }: RouteParams) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const invite = await prisma.userInvite.findUnique({
    where: { id },
  });

  if (!invite) return fail("Invite not found", 404);
  if (invite.status !== InviteStatus.PENDING)
    return fail("Only pending invites can be resent", 400);

  // Invalidate old token; new token sent via email.
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = addHours(now(), env.INVITE_TOKEN_TTL_HOURS);

  // Return the updated row so the client can splice it into the invites list
  // cache (new expiry) without a refetch.
  const updated = await prisma.userInvite.update({
    where: { id: invite.id },
    data: { tokenHash, expiresAt },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      status: true,
      createdAt: true,
      expiresAt: true,
    },
  });

  await sendInviteEmail({
    to: invite.email,
    firstName: invite.firstName,
    lastName: invite.lastName,
    inviteToken: rawToken,
  });

  return ok({ success: true, invite: updated });
}
