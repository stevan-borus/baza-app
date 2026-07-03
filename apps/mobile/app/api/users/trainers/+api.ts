import { formatFullName } from "@baza/types/common";
import { UserRole } from "@/generated/prisma";
import { requireRole } from "@/lib/server/auth-guards";
import { ok } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";

export async function GET(request: Request) {
  const guard = await requireRole(request, [UserRole.ADMIN, UserRole.TRAINER]);
  if (!guard.ok) return guard.response;

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: [UserRole.TRAINER, UserRole.ADMIN] },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
    },
    orderBy: { lastName: "asc" },
  });

  const shapedUsers = users.map((u) => ({
    id: u.id,
    fullName: formatFullName(u.firstName, u.lastName),
    role: u.role,
  }));

  return ok({ success: true, users: shapedUsers });
}
