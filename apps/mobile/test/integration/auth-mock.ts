import type { UserRole } from "@/generated/prisma";

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
