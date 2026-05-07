import { completeInviteInputSchema } from "@baza/types";
import { type Prisma, InviteStatus, UserRole } from "@/generated/prisma";
import { now } from "@/lib/now";
import { auth } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { hashPassword } from "@/lib/server/password";
import { prisma } from "@/lib/server/prisma";
import { hashToken } from "@/lib/server/tokens";
import { tryCatch } from "@/lib/server/try-catch";

export async function POST(request: Request) {
  const bodyResult = await tryCatch(request.json());
  const body = bodyResult.error ? null : bodyResult.data;
  const parsed = completeInviteInputSchema.safeParse(body);
  if (!parsed.success) {
    return fail("Invalid payload", 400, parsed.error);
  }

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
        fullName: invite.fullName,
        emailVerified: true,
        phone: invite.phone,
        role: invite.role ?? UserRole.CLIENT,
        passwordHash,
      },
      select: { id: true, email: true, role: true, fullName: true },
    });

    if (created.role === UserRole.CLIENT) {
      await tx.clientProfile.create({
        data: {
          userId: created.id,
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

  const signInResponse = await auth.api.signInEmail({
    body: {
      email: user.email,
      password: parsed.data.password,
    },
    headers: request.headers,
    asResponse: true,
  });

  const response = ok({
    success: true,
    user,
  });
  const sessionCookie = signInResponse.headers.get("set-cookie");
  if (sessionCookie) {
    response.headers.set("set-cookie", sessionCookie);
  }

  return response;
}
