import { formatFullName } from "@baza/types/common";
import { createInviteInputSchema } from "@baza/types/auth";
import {
  inviteMutationResponseSchema,
  invitesResponseSchema,
} from "@baza/types/clients";
import { UserRole } from "@/generated/prisma";
import { now } from "@/lib/now";
import { requireRole } from "@/lib/server/auth-guards";
import { env } from "@/lib/server/env";
import { respond, fail, parseBody } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { sendInviteEmail } from "@/lib/server/resend";
import { addHours, generateRawToken, hashToken } from "@/lib/server/tokens";

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const invites = await prisma.userInvite.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      status: true,
      role: true,
      createdAt: true,
    },
  });

  return respond(invitesResponseSchema, {
    success: true,
    invites: invites.map((inv) => ({
      ...inv,
      fullName: formatFullName(inv.firstName, inv.lastName),
      createdAt: inv.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const parsed = await parseBody(request, createInviteInputSchema);
  if (!parsed.ok) return parsed.response;

  const { email, firstName, lastName, phone, dateOfBirth, role } = parsed.data;
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
  const expiresAt = addHours(now(), env.INVITE_TOKEN_TTL_HOURS);
  // Store hash only; raw token sent via email for one-time use.
  const invite = await prisma.userInvite.create({
    data: {
      email: normalizedEmail,
      firstName,
      lastName,
      phone,
      // Only a client profile consumes the buffered DOB at redemption; a
      // trainer has none, so drop a stray one rather than store it unread.
      dateOfBirth: role === "CLIENT" && dateOfBirth ? new Date(dateOfBirth) : null,
      role,
      tokenHash,
      expiresAt,
      createdById: guard.user.id,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      status: true,
      role: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  await sendInviteEmail({
    to: normalizedEmail,
    firstName,
    lastName,
    inviteToken: rawToken,
  });

  return respond(inviteMutationResponseSchema, {
    success: true,
    invite: { ...invite, fullName: formatFullName(invite.firstName, invite.lastName) },
  });
}
