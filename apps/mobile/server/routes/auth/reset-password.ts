import { resetPasswordInputSchema } from "@baza/types/auth";
import { successResponseSchema } from "@baza/types/common";
import { now } from "@/lib/now";
import { fail, respond } from "@/lib/server/http";
import { hashPassword } from "@/lib/server/password";
import { prisma } from "@/lib/server/prisma";
import { hashToken } from "@/lib/server/tokens";
import { tryCatch } from "@/lib/server/try-catch";

export async function POST(request: Request) {
  const bodyResult = await tryCatch(request.json());
  const body = bodyResult.error ? null : bodyResult.data;
  const parsed = resetPasswordInputSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid payload", 400, parsed.error);

  // Trim before hashing: a token pasted from an email on mobile often carries
  // a leading/trailing space or newline, which would otherwise change the hash
  // and fail the lookup with a misleading "token expired".
  const tokenHash = hashToken(parsed.data.token.trim());

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      usedAt: true,
    },
  });

  if (!resetToken) return fail("Invalid reset token", 404);
  // One-time use; prevent replay.
  if (resetToken.usedAt) return fail("Reset token already used", 410);
  if (resetToken.expiresAt < now()) return fail("Reset token has expired", 410);

  const passwordHash = await hashPassword(parsed.data.password);

  // Atomic: update user + authAccount password, mark token used.
  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash, emailVerified: true },
    }),
    prisma.authAccount.updateMany({
      where: { userId: resetToken.userId, providerId: "credential" },
      data: { password: passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: now() },
    }),
  ]);

  return respond(successResponseSchema, { success: true });
}
