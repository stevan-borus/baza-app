import { UserRole } from "@/generated/prisma";
import { auth } from "@/lib/server/auth";
import { fail } from "@/lib/server/http";
import { prisma } from "@/lib/server/prisma";

/** Resolves active user from session; returns null if unauthenticated or inactive. */
export async function getRequestUser(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user?.id) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      role: true,
      email: true,
      isActive: true,
      clientProfile: { select: { id: true } },
    },
  });

  if (!user || !user.isActive) return null;

  return user;
}

/** Enforces role; returns guard with user or fail response. */
export async function requireRole(
  request: Request,
  allowedRoles: UserRole[],
) {
  const user = await getRequestUser(request);
  if (!user) {
    return { ok: false as const, response: fail("Unauthorized", 401) };
  }
  if (!allowedRoles.includes(user.role)) {
    return { ok: false as const, response: fail("Forbidden", 403) };
  }
  return { ok: true as const, user };
}
