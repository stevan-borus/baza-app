import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { fail, ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";
import { trainerLinkedToClientProfile } from "@/lib/server/trainer-scope";
import { tryCatch } from "@/lib/server/try-catch";

type RouteParams = Record<string, string>;

export async function PATCH(request: Request, { id }: RouteParams) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;

  const bodyResult = await tryCatch(request.json());
  const body = (bodyResult.error ? {} : bodyResult.data) as {
    fullName?: string;
    phone?: string | null;
    notes?: string | null;
    isActive?: boolean;
  };

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

    // Trainers restricted to notes only; fullName/phone/isActive are admin-only.
    if (
      body.fullName !== undefined ||
      body.phone !== undefined ||
      body.isActive !== undefined
    ) {
      return fail("Trainers can only update client notes", 403);
    }
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      fullName: body.fullName,
      phone: body.phone,
      isActive: body.isActive,
      clientProfile: body.notes !== undefined ? { update: { notes: body.notes } } : undefined,
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      isActive: true,
      clientProfile: { select: { id: true, notes: true } },
    },
  });

  return ok({ success: true, user });
}
