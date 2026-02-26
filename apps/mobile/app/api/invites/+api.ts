import { inviteClientInputSchema } from "@baza/types";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { env } from "@/lib/server/env";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { sendInviteEmail } from "@/lib/server/resend";
import { addHours, generateRawToken, hashToken } from "@/lib/server/tokens";
import { tryCatch } from "@/lib/server/try-catch";

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const invites = await prisma.userInvite.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      fullName: true,
      phone: true,
      status: true,
      createdAt: true,
    },
  });

  return ok({
    success: true,
    invites: invites.map((inv) => ({
      ...inv,
      createdAt: inv.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const bodyResult = await tryCatch(request.json());
  const body = bodyResult.error ? null : bodyResult.data;
  const parsed = inviteClientInputSchema.safeParse(body);
  if (!parsed.success) {
    return fail("Invalid payload", 400, parsed.error);
  }

  const { email, fullName, phone } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, isActive: true },
  });

  if (existingUser) {
    return fail("User with this email already exists", 409);
  }

  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = addHours(new Date(), env.INVITE_TOKEN_TTL_HOURS);
  // Store hash only; raw token sent via email for one-time use.
  const invite = await prisma.userInvite.create({
    data: {
      email: normalizedEmail,
      fullName,
      phone,
      role: UserRole.CLIENT,
      tokenHash,
      expiresAt,
      createdById: guard.user.id,
    },
    select: {
      id: true,
      email: true,
      status: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  await sendInviteEmail({
    to: normalizedEmail,
    fullName,
    inviteToken: rawToken,
  });

  return ok({
    success: true,
    invite,
  });
}
