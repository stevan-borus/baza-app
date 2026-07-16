import { requestPasswordResetInputSchema } from "@baza/types/auth";
import { successResponseSchema } from "@baza/types/common";
import { now } from "@/lib/now";
import { respond, parseBody } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { sendResetEmail } from "@/lib/server/resend";
import { addMinutes, generateRawToken, hashToken } from "@/lib/server/tokens";
import { env } from "@/lib/server/env";

export async function POST(request: Request) {
  const parsed = await parseBody(request, requestPasswordResetInputSchema);
  if (!parsed.ok) return parsed.response;

  const email = parsed.data.email.toLowerCase().trim();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, isActive: true },
  });

  // Intentionally avoid email-enumeration leaks.
  if (!user || !user.isActive) {
    return respond(successResponseSchema, { success: true });
  }

  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = addMinutes(now(), env.RESET_TOKEN_TTL_MINUTES);

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
    },
  });

  await sendResetEmail({
    to: user.email,
    resetToken: rawToken,
  });

  return respond(successResponseSchema, { success: true });
}
