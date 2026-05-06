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

import { GET, POST } from "@/app/api/rooms/+api";
import { prisma } from "@/lib/server/prisma";

function asRole(role: "ADMIN" | "TRAINER" | "CLIENT") {
  setMockUser({
    id: "u-1",
    role,
    email: `${role.toLowerCase()}@test.local`,
    isActive: true,
    clientProfile: role === "CLIENT" ? { id: "p-1" } : null,
  });
}

describe("rooms API", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("POST /api/rooms creates a studio room (admin only)", async () => {
    asRole("ADMIN");
    const response = await POST(
      new Request("http://test.local/api/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Sala 1", capacity: 6 }),
      }),
    );
    expect(response.status).toBe(201);
    const persisted = await prisma.studioRoom.findFirst({
      where: { name: "Sala 1" },
    });
    expect(persisted).not.toBeNull();
  });

  it("POST /api/rooms is forbidden for non-admin callers", async () => {
    asRole("TRAINER");
    const response = await POST(
      new Request("http://test.local/api/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Sala 2", capacity: 6 }),
      }),
    );
    expect(response.status).toBe(403);
    expect(await prisma.studioRoom.count()).toBe(0);
  });

  it("GET /api/rooms returns the rooms in alphabetical order for admin", async () => {
    await prisma.studioRoom.createMany({
      data: [
        { name: "Sala 2", capacity: 6 },
        { name: "Sala 1", capacity: 8 },
      ],
    });
    asRole("ADMIN");
    const response = await GET(new Request("http://test.local/api/rooms"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { rooms: { name: string }[] };
    expect(body.rooms.map((r) => r.name)).toEqual(["Sala 1", "Sala 2"]);
  });

  it("GET /api/rooms is allowed for trainers (needed for scheduling UX)", async () => {
    await prisma.studioRoom.create({ data: { name: "Sala 1", capacity: 6 } });
    asRole("TRAINER");
    const response = await GET(new Request("http://test.local/api/rooms"));
    expect(response.status).toBe(200);
  });

  it("GET /api/rooms is forbidden for clients", async () => {
    asRole("CLIENT");
    const response = await GET(new Request("http://test.local/api/rooms"));
    expect(response.status).toBe(403);
  });
});
