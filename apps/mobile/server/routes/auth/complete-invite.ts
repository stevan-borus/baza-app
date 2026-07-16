import {
  completeInviteInputSchema,
  completeInviteResponseSchema,
} from "@baza/types/auth";
import { formatFullName } from "@baza/types/common";
import { type Prisma, InviteStatus, UserRole } from "@/generated/prisma";
import { now } from "@/lib/now";
import { respond, fail, parseBody } from "@/lib/server/http";
import { hashPassword } from "@/lib/server/password";
import { prisma } from "@/lib/server/prisma";
import { hashToken } from "@/lib/server/tokens";

export async function POST(request: Request) {
  const parsed = await parseBody(request, completeInviteInputSchema);
  if (!parsed.ok) return parsed.response;

  // Compare hashed token to avoid timing attacks on token lookup.
  const tokenHash = hashToken(parsed.data.token);
  const invite = await prisma.userInvite.findUnique({
    where: { tokenHash },
  });

  if (!invite) return fail("Invalid invite token", 404);
  if (invite.status !== InviteStatus.PENDING) return fail("Invite is no longer active", 410);
  if (invite.expiresAt < now()) {
    // Mark expired so it cannot be retried.
    await prisma.userInvite.update({
      where: { id: invite.id },
      data: { status: InviteStatus.EXPIRED },
    });
    return fail("Invite has expired", 410);
  }

  const passwordHash = await hashPassword(parsed.data.password);

  // Atomic: create user, clientProfile (if client), authAccount, and mark invite completed.
  const user = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.user.create({
      data: {
        email: invite.email,
        firstName: invite.firstName,
        lastName: invite.lastName,
        emailVerified: true,
        phone: invite.phone,
        role: invite.role ?? UserRole.CLIENT,
        passwordHash,
      },
      select: { id: true, email: true, role: true, firstName: true, lastName: true },
    });

    if (created.role === UserRole.CLIENT) {
      await tx.clientProfile.create({
        data: {
          userId: created.id,
          dateOfBirth: invite.dateOfBirth,
        },
      });
    }

    await tx.authAccount.create({
      data: {
        userId: created.id,
        accountId: created.id,
        providerId: "credential",
        password: passwordHash,
      },
    });

    await tx.userInvite.update({
      where: { id: invite.id },
      data: {
        status: InviteStatus.COMPLETED,
        invitedUserId: created.id,
      },
    });

    return created;
  });

  // No session is minted here — the client signs in through authClient with
  // the just-created credentials, which is the only path that persists the
  // session cookie on native (the plain-fetch seam drops response cookies).
  return respond(completeInviteResponseSchema, {
    success: true,
    user: { ...user, fullName: formatFullName(user.firstName, user.lastName) },
  });
}
