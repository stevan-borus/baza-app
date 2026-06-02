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

import { PATCH, DELETE } from "@/app/api/trainings/class-types/[id]/+api";
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

describe("class-types PATCH + DELETE", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("PATCH updates editable fields on an existing class type (admin)", async () => {
    const ct = await prisma.classType.create({
      data: { name: "Reformer", maxClients: 6, durationMins: 60 },
    });
    asAdmin();
    const response = await PATCH(
      new Request(`http://test.local/api/trainings/class-types/${ct.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ maxClients: 8, durationMins: 75 }),
      }),
      { id: ct.id },
    );
    expect(response.status).toBe(200);
    const reloaded = await prisma.classType.findUnique({ where: { id: ct.id } });
    expect(reloaded?.maxClients).toBe(8);
    expect(reloaded?.durationMins).toBe(75);
  });

  it("PATCH returns 404 for an unknown class type id", async () => {
    asAdmin();
    const response = await PATCH(
      new Request("http://test.local/api/trainings/class-types/x", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ maxClients: 12 }),
      }),
      { id: "00000000-0000-0000-0000-000000000000" },
    );
    expect(response.status).toBe(404);
  });

  it("DELETE succeeds when no PackageType or Session references the class type", async () => {
    const ct = await prisma.classType.create({
      data: { name: "Standalone", maxClients: 6, durationMins: 60 },
    });
    asAdmin();
    const response = await DELETE(
      new Request(`http://test.local/api/trainings/class-types/${ct.id}`, {
        method: "DELETE",
      }),
      { id: ct.id },
    );
    expect(response.status).toBe(200);
    expect(await prisma.classType.findUnique({ where: { id: ct.id } })).toBeNull();
  });

  it("DELETE returns 409 when a PackageType references the class type", async () => {
    const ct = await prisma.classType.create({
      data: { name: "WithPack", maxClients: 6, durationMins: 60 },
    });
    await prisma.packageType.create({
      data: {
        name: "WithPack 12",
        sessionCount: 12,
        validityDays: 30,
        lateCancelHours: 12,
        classTypeId: ct.id,
      },
    });
    asAdmin();
    const response = await DELETE(
      new Request(`http://test.local/api/trainings/class-types/${ct.id}`, {
        method: "DELETE",
      }),
      { id: ct.id },
    );
    expect(response.status).toBe(409);
    expect(await prisma.classType.findUnique({ where: { id: ct.id } })).not.toBeNull();
  });

  it("DELETE returns 409 when a Session references the class type (even with no PackageType)", async () => {
    const ct = await prisma.classType.create({
      data: { name: "WithSession", maxClients: 6, durationMins: 60 },
    });
    const trainer = await prisma.user.create({
      data: { email: "t@test.local", firstName: "T", lastName: "Test", role: "TRAINER" },
    });
    await prisma.session.create({
      data: {
        classTypeId: ct.id,
        trainerUserId: trainer.id,
        startsAt: new Date("2026-08-10T10:00:00Z"),
        endsAt: new Date("2026-08-10T11:00:00Z"),
        capacity: 6,
        status: "SCHEDULED",
        isActive: true,
      },
    });
    asAdmin();
    const response = await DELETE(
      new Request(`http://test.local/api/trainings/class-types/${ct.id}`, {
        method: "DELETE",
      }),
      { id: ct.id },
    );
    expect(response.status).toBe(409);
    expect(await prisma.classType.findUnique({ where: { id: ct.id } })).not.toBeNull();
  });
});
