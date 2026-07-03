import type { UserRole } from "@/generated/prisma";
import { fail } from "@/lib/server/http";

type MockUser = {
  id: string;
  role: UserRole;
  email: string;
  isActive: boolean;
  clientProfile: { id: string } | null;
  // The real getRequestUser always returns these; most tests don't assert on
  // them so they're optional on the stub.
  firstName?: string;
  lastName?: string;
  fullName?: string;
  createdAt?: Date;
};

let currentMockUser: MockUser | null = null;

export function setMockUser(user: MockUser | null) {
  currentMockUser = user;
}

export function getMockUser() {
  return currentMockUser;
}

// Canonical vi.mock factory for "@/lib/server/auth-guards". Use as:
//   vi.mock("@/lib/server/auth-guards", authGuardsMock);
export function authGuardsMock() {
  return {
    requireRole: async (_req: Request, allowed: string[]) => {
      const user = getMockUser();
      if (!user) return { ok: false as const, response: fail("Unauthorized", 401) };
      if (!allowed.includes(user.role)) return { ok: false as const, response: fail("Forbidden", 403) };
      return { ok: true as const, user };
    },
    getRequestUser: async () => getMockUser(),
  };
}
