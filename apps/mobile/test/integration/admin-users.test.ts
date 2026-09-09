import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { GET as GET_USERS } from "@/server/routes/admin/users";
import { POST as POST_UNLOCK } from "@/server/routes/admin/users/[id]/unlock";
import { nowMs } from "@/lib/now";
import { prisma } from "@/lib/server/prisma";
import type { UserRole } from "@/generated/prisma";

const LOCKED_UNTIL = () => new Date(nowMs() + 15 * 60_000);

async function createUser(opts: {
  email: string;
  lastName: string;
  role: UserRole;
  isActive?: boolean;
  lockedUntil?: Date | null;
}) {
  return prisma.user.create({
    data: {
      email: opts.email,
      firstName: "Ime",
      lastName: opts.lastName,
      role: opts.role,
      isActive: opts.isActive ?? true,
      lockedUntil: opts.lockedUntil ?? null,
    },
  });
}

function asAdmin(id = "admin-1") {
  setMockUser({
    id,
    role: "ADMIN",
    email: "admin@test.local",
    isActive: true,
    clientProfile: null,
  });
}

function asTrainer(id = "trainer-1") {
  setMockUser({
    id,
    role: "TRAINER",
    email: "trainer@test.local",
    isActive: true,
    clientProfile: null,
  });
}

const usersRequest = () => new Request("http://test.local/api/admin/users");
const unlockRequest = () =>
  new Request("http://test.local/api/admin/users/x/unlock", { method: "POST" });

describe("admin users — sign-in lock management", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  describe("GET /api/admin/users", () => {
    it("lists active trainers and admins ordered by last name", async () => {
      await createUser({ email: "b@test.local", lastName: "Babić", role: "TRAINER" });
      await createUser({ email: "a@test.local", lastName: "Antić", role: "ADMIN" });
      asAdmin();

      const response = await GET_USERS(usersRequest());
      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        users: { email: string; lastName: string; fullName: string }[];
      };
      expect(body.users.map((u) => u.lastName)).toEqual(["Antić", "Babić"]);
      expect(body.users[0].fullName).toBe("Ime Antić");
    });

    it("excludes clients and deactivated staff", async () => {
      await createUser({ email: "client@test.local", lastName: "Klijent", role: "CLIENT" });
      await createUser({
        email: "gone@test.local",
        lastName: "Deaktiviran",
        role: "TRAINER",
        isActive: false,
      });
      await createUser({ email: "keep@test.local", lastName: "Aktivan", role: "TRAINER" });
      asAdmin();

      const response = await GET_USERS(usersRequest());
      const body = (await response.json()) as { users: { email: string }[] };
      expect(body.users.map((u) => u.email)).toEqual(["keep@test.local"]);
    });

    it("reports a live lock as an ISO string and an expired one as null", async () => {
      const lockedUntil = LOCKED_UNTIL();
      await createUser({
        email: "locked@test.local",
        lastName: "Alocked",
        role: "TRAINER",
        lockedUntil,
      });
      await createUser({
        email: "expired@test.local",
        lastName: "Bexpired",
        role: "TRAINER",
        lockedUntil: new Date(nowMs() - 60_000),
      });
      asAdmin();

      const response = await GET_USERS(usersRequest());
      const body = (await response.json()) as {
        users: { email: string; lockedUntil: string | null }[];
      };
      expect(body.users[0].lockedUntil).toBe(lockedUntil.toISOString());
      expect(body.users[1].lockedUntil).toBeNull();
    });

    it("returns 403 for a trainer", async () => {
      asTrainer();
      const response = await GET_USERS(usersRequest());
      expect(response.status).toBe(403);
    });
  });

  describe("POST /api/admin/users/[id]/unlock", () => {
    it.each([
      ["a client", "CLIENT" as UserRole],
      ["a trainer", "TRAINER" as UserRole],
      ["an admin", "ADMIN" as UserRole],
    ])("clears the lock on %s", async (_label, role) => {
      const user = await createUser({
        email: `${role.toLowerCase()}@test.local`,
        lastName: "Zaključan",
        role,
        lockedUntil: LOCKED_UNTIL(),
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { failedSignInCount: 4, lastFailedSignInAt: new Date(nowMs()) },
      });
      asAdmin();

      const response = await POST_UNLOCK(unlockRequest(), { id: user.id });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        success: true,
        user: { id: user.id, lockedUntil: null },
      });

      const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.lockedUntil).toBeNull();
      expect(after.failedSignInCount).toBe(0);
      expect(after.lastFailedSignInAt).toBeNull();
    });

    it("is idempotent on a user who is not locked", async () => {
      const user = await createUser({
        email: "open@test.local",
        lastName: "Otključan",
        role: "TRAINER",
      });
      asAdmin();

      const first = await POST_UNLOCK(unlockRequest(), { id: user.id });
      const second = await POST_UNLOCK(unlockRequest(), { id: user.id });
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
    });

    it("returns 404 for an unknown user id", async () => {
      asAdmin();
      const response = await POST_UNLOCK(unlockRequest(), {
        id: "00000000-0000-0000-0000-000000000000",
      });
      expect(response.status).toBe(404);
    });

    it("returns 403 for a trainer", async () => {
      const user = await createUser({
        email: "target@test.local",
        lastName: "Meta",
        role: "TRAINER",
        lockedUntil: LOCKED_UNTIL(),
      });
      asTrainer();

      const response = await POST_UNLOCK(unlockRequest(), { id: user.id });
      expect(response.status).toBe(403);

      const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.lockedUntil).not.toBeNull();
    });
  });
});
