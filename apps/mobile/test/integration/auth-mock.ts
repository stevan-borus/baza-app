import type { UserRole } from "@/generated/prisma";

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
