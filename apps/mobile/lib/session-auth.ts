import { authClient } from "@/lib/auth-client";

export const APP_ROLES = ["ADMIN", "TRAINER", "CLIENT"] as const;

export type AppRole = (typeof APP_ROLES)[number];

type SessionUser = {
  role?: string | null;
};

/**
 * Normalizes role from Better Auth session to our app role union.
 */
export function readSessionRole(user: unknown): AppRole | null {
  if (!user || typeof user !== "object") return null;
  const candidate = (user as SessionUser).role;
  if (!candidate) return null;
  if ((APP_ROLES as readonly string[]).includes(candidate)) {
    return candidate as AppRole;
  }
  return null;
}

/**
 * Shared auth state for route guards and role-based redirects.
 */
export function useSessionAuth() {
  const session = authClient.useSession();
  const role = readSessionRole(session.data?.user);
  return { ...session, role };
}
