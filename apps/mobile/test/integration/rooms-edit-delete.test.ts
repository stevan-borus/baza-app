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

import { PATCH, DELETE } from "@/app/api/rooms/[id]/+api";
import { prisma } from "@/lib/server/prisma";

function asAdmin() {
  setMockUser({
    id: "admin-1",
    role: "ADMIN",
    email: "admin@test.local",
    isActive: true,
    clientProfile: null,
  });
}

describe("rooms PATCH + DELETE", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("PATCH updates an existing studio room (admin)", async () => {
    const room = await prisma.studioRoom.create({
      data: { name: "Sala 1", capacity: 6 },
    });
    asAdmin();
    const response = await PATCH(
      new Request(`http://test.local/api/rooms/${room.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ capacity: 10 }),
      }),
      { id: room.id },
    );
    expect(response.status).toBe(200);
    const reloaded = await prisma.studioRoom.findUnique({ where: { id: room.id } });
    expect(reloaded?.capacity).toBe(10);
  });

  it("PATCH returns 404 for an unknown room id", async () => {
    asAdmin();
    const response = await PATCH(
      new Request("http://test.local/api/rooms/x", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ capacity: 8 }),
      }),
      { id: "00000000-0000-0000-0000-000000000000" },
    );
    expect(response.status).toBe(404);
  });

  it("DELETE succeeds when no session references the room", async () => {
    const room = await prisma.studioRoom.create({
      data: { name: "Sala 2", capacity: 6 },
    });
    asAdmin();
    const response = await DELETE(
      new Request(`http://test.local/api/rooms/${room.id}`, { method: "DELETE" }),
      { id: room.id },
    );
    expect(response.status).toBe(200);
    expect(await prisma.studioRoom.findUnique({ where: { id: room.id } })).toBeNull();
  });

  it("DELETE returns 409 when at least one session references the room", async () => {
    const room = await prisma.studioRoom.create({
      data: { name: "Sala 3", capacity: 6 },
    });
    const trainer = await prisma.user.create({
      data: { email: "t@test.local", firstName: "T", lastName: "Test", role: "TRAINER" },
    });
    const reformer = await prisma.classType.create({
      data: { name: "Reformer", maxClients: 6, durationMins: 60 },
    });
    await prisma.session.create({
      data: {
        classTypeId: reformer.id,
        trainerUserId: trainer.id,
        roomId: room.id,
        startsAt: new Date("2026-08-10T10:00:00Z"),
        endsAt: new Date("2026-08-10T11:00:00Z"),
        capacity: 6,
        status: "SCHEDULED",
        isActive: true,
      },
    });
    asAdmin();
    const response = await DELETE(
      new Request(`http://test.local/api/rooms/${room.id}`, { method: "DELETE" }),
      { id: room.id },
    );
    expect(response.status).toBe(409);
    expect(await prisma.studioRoom.findUnique({ where: { id: room.id } })).not.toBeNull();
  });
});
