import type { ClientPackageStatus } from "@baza/types/packages";
import { formatFullName } from "@baza/types/common";
import { updateClientInputSchema } from "@baza/types/clients";
import { UserRole } from "@/generated/prisma";
import { now } from "@/lib/now";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { trainerLinkedToClientProfile } from "@/lib/server/trainer-scope";
import { tryCatch } from "@/lib/server/try-catch";

type RouteParams = Record<string, string>;

const EXPIRING_WINDOW_DAYS = 14;

/** Returns a single client's profile. Trainers must be linked via an active booking. */
export async function GET(request: Request, { id }: RouteParams) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;

  const currentInstant = now();

  const clientProfile = await prisma.clientProfile.findUnique({
    where: { userId: id },
    select: {
      id: true,
      notes: true,
      dateOfBirth: true,
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          isActive: true,
        },
      },
      packages: { select: { sessionsRemaining: true, expiresAt: true } },
      packagePauses: {
        where: {
          startsAt: { lte: currentInstant },
          endsAt: { gte: currentInstant },
        },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!clientProfile) return fail("Client not found", 404);

  // Trainers may only see clients they are linked to via active bookings.
  if (guard.user.role === UserRole.TRAINER) {
    const allowed = await trainerLinkedToClientProfile(
      guard.user.id,
      clientProfile.id,
    );
    if (!allowed) return fail("Forbidden", 403);
  }

  // Compute the same package status used by the list endpoint.
  // Priority: paused (overrides) > active > expiring > expired > none.
  const expiringThreshold = new Date(
    currentInstant.getTime() + EXPIRING_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  let packageStatus: ClientPackageStatus = "none";
  if (clientProfile.packagePauses.length > 0) {
    packageStatus = "paused";
  } else {
    let hasExpired = false;
    for (const p of clientProfile.packages) {
      const isExpired = p.expiresAt < currentInstant || p.sessionsRemaining <= 0;
      if (isExpired) {
        hasExpired = true;
        continue;
      }
      if (p.expiresAt <= expiringThreshold) {
        if (packageStatus !== "active") packageStatus = "expiring";
      } else {
        packageStatus = "active";
      }
    }
    if (packageStatus === "none" && hasExpired) packageStatus = "expired";
  }

  return ok({
    success: true,
    client: {
      id: clientProfile.id,
      notes: clientProfile.notes,
      dateOfBirth: clientProfile.dateOfBirth
        ? clientProfile.dateOfBirth.toISOString().slice(0, 10)
        : null,
      packageStatus,
      user: {
        ...clientProfile.user,
        fullName: formatFullName(
          clientProfile.user.firstName,
          clientProfile.user.lastName,
        ),
      },
    },
  });
}

export async function PATCH(request: Request, { id }: RouteParams) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;

  const bodyResult = await tryCatch(request.json());
  const raw = bodyResult.error ? null : bodyResult.data;
  const parsed = updateClientInputSchema.safeParse(raw);
  if (!parsed.success) return fail("Invalid payload", 400, parsed.error);
  const body = parsed.data;

  const existingClient = await prisma.clientProfile.findUnique({
    where: { userId: id },
    select: { id: true },
  });
  if (!existingClient) return fail("Client not found", 404);

  // Trainers may only update clients they are linked to.
  if (guard.user.role === UserRole.TRAINER) {
    const canAccessClient = await trainerLinkedToClientProfile(
      guard.user.id,
      existingClient.id,
    );
    if (!canAccessClient) {
      return fail("Forbidden", 403);
    }

    // Trainers restricted to notes only; firstName/lastName/phone/isActive/dateOfBirth are admin-only.
    if (
      body.firstName !== undefined ||
      body.lastName !== undefined ||
      body.phone !== undefined ||
      body.isActive !== undefined ||
      body.dateOfBirth !== undefined
    ) {
      return fail("Trainers can only update client notes", 403);
    }
  }

  const clientProfileUpdate: { notes?: string | null; dateOfBirth?: Date | null } = {};
  if (body.notes !== undefined) clientProfileUpdate.notes = body.notes;
  if (body.dateOfBirth !== undefined) {
    clientProfileUpdate.dateOfBirth =
      body.dateOfBirth === null ? null : new Date(body.dateOfBirth);
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(body.firstName !== undefined ? { firstName: body.firstName } : {}),
      ...(body.lastName !== undefined ? { lastName: body.lastName } : {}),
      phone: body.phone,
      isActive: body.isActive,
      clientProfile: Object.keys(clientProfileUpdate).length
        ? { update: clientProfileUpdate }
        : undefined,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      isActive: true,
      clientProfile: {
        select: { id: true, notes: true, dateOfBirth: true },
      },
    },
  });

  return ok({
    success: true,
    user: { ...user, fullName: formatFullName(user.firstName, user.lastName) },
  });
}
