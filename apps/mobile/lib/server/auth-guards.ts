import { UserRole } from "@/generated/prisma";
import { formatFullName } from "@baza/types/common";
import { auth } from "@/lib/server/auth";
import { fail } from "@/lib/server/http";

/**
 * Resolves the active user from the session; returns null if unauthenticated
 * or inactive.
 *
 * The session's `user` is enriched by the `customSession` plugin in
 * `auth.ts` — it already carries `role`, `email`, `firstName`, `lastName`,
 * `isActive`, and `clientProfileId`. We trust it and do NOT re-fetch the user
 * row, saving one DB round-trip on every authenticated request. `isActive` and
 * role are read live from the DB inside the enrichment callback on each
 * `getSession`, so deactivation/role changes still take effect immediately (no
 * cookie-cache lag).
 */
export async function getRequestUser(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  const user = session?.user;
  if (!user?.id || !user.isActive) return null;

  return {
    id: user.id,
    role: user.role as UserRole,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    isActive: user.isActive,
    createdAt: user.createdAt,
    fullName: formatFullName(user.firstName, user.lastName),
    clientProfile: user.clientProfileId
      ? { id: user.clientProfileId }
      : null,
  };
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
