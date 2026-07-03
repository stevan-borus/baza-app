import { requestPasswordResetInputSchema } from "@baza/types/auth";
import { now } from "@/lib/now";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { sendResetEmail } from "@/lib/server/resend";
import { addMinutes, generateRawToken, hashToken } from "@/lib/server/tokens";
import { env } from "@/lib/server/env";
import { tryCatch } from "@/lib/server/try-catch";

export async function POST(request: Request) {
  const bodyResult = await tryCatch(request.json());
  const body = bodyResult.error ? null : bodyResult.data;
  const parsed = requestPasswordResetInputSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid payload", 400, parsed.error);

  const email = parsed.data.email.toLowerCase().trim();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, isActive: true },
  });

  // Intentionally avoid email-enumeration leaks.
  if (!user || !user.isActive) {
    return ok({ success: true });
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

  return ok({ success: true });
}
