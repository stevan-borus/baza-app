import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => {
  const { fail } = await import("@/lib/server/http");
  const mod = await import("./auth-mock");
  return {
    requireRole: async (_req: Request, allowed: string[]) => {
      const user = mod.getMockUser();
      if (!user) return { ok: false as const, response: fail("Unauthorized", 401) };
      if (!allowed.includes(user.role)) return { ok: false as const, response: fail("Forbidden", 403) };
      return { ok: true as const, user };
    },
    getRequestUser: async () => mod.getMockUser(),
  };
});

import { GET as GET_CLASS_TYPES, POST as POST_CLASS_TYPE } from "@/app/api/trainings/class-types/+api";
import { GET as GET_TRAINERS } from "@/app/api/users/trainers/+api";
import { prisma } from "@/lib/server/prisma";

function asRole(role: "ADMIN" | "TRAINER" | "CLIENT", id = "u-1") {
  setMockUser({
    id,
    role,
    email: `${role.toLowerCase()}@test.local`,
    isActive: true,
    clientProfile: role === "CLIENT" ? { id: "p-1" } : null,
  });
}

describe("trainings + users/trainers", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("GET /api/trainings/class-types lists class types alphabetically for admin and trainer", async () => {
    await prisma.classType.createMany({
      data: [
        { name: "Reformer pilates", maxClients: 6, durationMins: 60 },
        { name: "Energy pilates", maxClients: 12, durationMins: 60 },
      ],
    });
    asRole("TRAINER");
    const response = await GET_CLASS_TYPES(
      new Request("http://test.local/api/trainings/class-types"),
    );
    const body = (await response.json()) as { classTypes: { name: string }[] };
    expect(body.classTypes.map((c) => c.name)).toEqual([
      "Energy pilates",
      "Reformer pilates",
    ]);
  });

  it("GET /api/trainings/class-types is forbidden for clients", async () => {
    asRole("CLIENT");
    const response = await GET_CLASS_TYPES(
      new Request("http://test.local/api/trainings/class-types"),
    );
    expect(response.status).toBe(403);
  });

  it("POST /api/trainings/class-types creates a new class type (admin only)", async () => {
    asRole("ADMIN");
    const response = await POST_CLASS_TYPE(
      new Request("http://test.local/api/trainings/class-types", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Moms&Minis",
          maxClients: 8,
          durationMins: 50,
        }),
      }),
    );
    expect(response.status).toBe(201);
    const persisted = await prisma.classType.findFirst({
      where: { name: "Moms&Minis" },
    });
    expect(persisted).not.toBeNull();
  });

  it("GET /api/users/trainers returns only active trainers and admins, sorted by name", async () => {
    await prisma.user.createMany({
      data: [
        { email: "z-admin@test.local", fullName: "Z Admin", role: "ADMIN" },
        { email: "trainer-b@test.local", fullName: "Trainer B", role: "TRAINER" },
        { email: "trainer-a@test.local", fullName: "Trainer A", role: "TRAINER" },
        {
          email: "deactivated@test.local",
          fullName: "Deactivated",
          role: "TRAINER",
          isActive: false,
        },
        { email: "client@test.local", fullName: "Client", role: "CLIENT" },
      ],
    });
    asRole("ADMIN");
    const response = await GET_TRAINERS(
      new Request("http://test.local/api/users/trainers"),
    );
    const body = (await response.json()) as { users: { fullName: string; role: string }[] };
    expect(body.users.map((u) => u.fullName)).toEqual([
      "Trainer A",
      "Trainer B",
      "Z Admin",
    ]);
    expect(body.users.map((u) => u.fullName)).not.toContain("Deactivated");
    expect(body.users.map((u) => u.fullName)).not.toContain("Client");
  });

  it("GET /api/users/trainers is forbidden for clients", async () => {
    asRole("CLIENT");
    const response = await GET_TRAINERS(
      new Request("http://test.local/api/users/trainers"),
    );
    expect(response.status).toBe(403);
  });
});
