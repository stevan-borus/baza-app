import type { UserRole } from "@/generated/prisma";

/**
 * Module-level "current user" used by the mocked `requireRole`. Tests set this
 * via `setMockUser(...)` before each call. Because `vi.mock()` factories run
 * once per test file, this state is per-file — that's fine since we run tests
 * serially within an integration project.
 */
type MockUser = {
  id: string;
  role: UserRole;
  email: string;
  isActive: boolean;
  clientProfile: { id: string } | null;
};

let currentMockUser: MockUser | null = null;

export function setMockUser(user: MockUser | null) {
  currentMockUser = user;
}

export function getMockUser() {
  return currentMockUser;
}
