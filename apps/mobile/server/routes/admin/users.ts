import { adminUsersResponseSchema } from "@baza/types/admin-users";
import { formatFullName } from "@baza/types/common";
import { UserRole } from "@/generated/prisma";
import { now } from "@/lib/now";
import { requireRole } from "@/lib/server/auth-guards";
import { respond } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";

/** Staff rows for the Admin sign-in-lock screen. */
export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN]);
  if (!guard.ok) return guard.response;

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: [UserRole.ADMIN, UserRole.TRAINER] },
    },
    orderBy: { lastName: "asc" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      lockedUntil: true,
    },
  });

  const currentInstant = now();

  return respond(adminUsersResponseSchema, {
    success: true,
    users: users.map((user) => ({
      ...user,
      fullName: formatFullName(user.firstName, user.lastName),
      // An elapsed lock is not a lock — reporting it would show a padlock the
      // Admin cannot clear, because sign-in already lets the user through.
      lockedUntil:
        user.lockedUntil && user.lockedUntil > currentInstant
          ? user.lockedUntil.toISOString()
          : null,
    })),
  });
}
