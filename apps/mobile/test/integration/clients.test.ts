/**
 * Integration tests for GET /api/clients/[id].
 *
 * Auth is mocked via `auth-mock` — each test calls `setMockUser()` to assert
 * a role + identity, then invokes the route handler directly. The Prisma
 * client hits the real test DB (env.setup.ts). We reset rows in beforeEach.
 */
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

import { GET } from "@/app/api/clients/[id]/+api";
import { prisma } from "@/lib/server/prisma";

async function seed() {
  const admin = await prisma.user.create({
    data: { email: "admin@test.local", fullName: "Admin", role: "ADMIN" },
  });
  const trainerLinked = await prisma.user.create({
    data: { email: "trainer-linked@test.local", fullName: "Linked Trainer", role: "TRAINER" },
  });
  const trainerOther = await prisma.user.create({
    data: { email: "trainer-other@test.local", fullName: "Other Trainer", role: "TRAINER" },
  });
  const clientUser = await prisma.user.create({
    data: { email: "client@test.local", fullName: "The Client", role: "CLIENT" },
  });
  const clientProfile = await prisma.clientProfile.create({
    data: { userId: clientUser.id, notes: "Has tight hamstrings" },
  });
  const classType = await prisma.classType.create({
    data: { name: "Reformer", maxClients: 6, durationMins: 60 },
  });

  // Active booking links `trainerLinked` to the client.
  const session = await prisma.session.create({
    data: {
      classTypeId: classType.id,
      trainerUserId: trainerLinked.id,
      startsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      endsAt: new Date(Date.now() - 23 * 60 * 60 * 1000),
      capacity: 6,
      isActive: true,
      status: "SCHEDULED",
    },
  });
  await prisma.booking.create({
    data: {
      sessionId: session.id,
      clientProfileId: clientProfile.id,
    },
  });

  return { admin, trainerLinked, trainerOther, clientUser, clientProfile };
}

function buildRequest(id: string) {
  return new Request(`http://test.local/api/clients/${id}`);
}

describe("GET /api/clients/[id]", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("returns 200 with client data when caller is admin", async () => {
    const { admin, clientUser, clientProfile } = await seed();
    setMockUser({
      id: admin.id,
      role: "ADMIN",
      email: admin.email,
      isActive: true,
      clientProfile: null,
    });

    const res = await GET(buildRequest(clientUser.id), { id: clientUser.id });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.client.id).toBe(clientProfile.id);
    expect(json.client.user.id).toBe(clientUser.id);
    expect(json.client.user.email).toBe("client@test.local");
    expect(json.client.notes).toBe("Has tight hamstrings");
  });

  it("returns 200 when trainer is linked to the client via active booking", async () => {
    const { trainerLinked, clientUser } = await seed();
    setMockUser({
      id: trainerLinked.id,
      role: "TRAINER",
      email: trainerLinked.email,
      isActive: true,
      clientProfile: null,
    });

    const res = await GET(buildRequest(clientUser.id), { id: clientUser.id });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.client.user.id).toBe(clientUser.id);
  });

  it("returns 403 when trainer is not linked to the client", async () => {
    const { trainerOther, clientUser } = await seed();
    setMockUser({
      id: trainerOther.id,
      role: "TRAINER",
      email: trainerOther.email,
      isActive: true,
      clientProfile: null,
    });

    const res = await GET(buildRequest(clientUser.id), { id: clientUser.id });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.client).toBeUndefined();
  });

  it("returns 403 when caller is a client", async () => {
    const { clientUser, clientProfile } = await seed();
    setMockUser({
      id: clientUser.id,
      role: "CLIENT",
      email: clientUser.email,
      isActive: true,
      clientProfile: { id: clientProfile.id },
    });

    const res = await GET(buildRequest(clientUser.id), { id: clientUser.id });
    expect(res.status).toBe(403);
  });

  it("returns 404 when target client does not exist", async () => {
    const { admin } = await seed();
    setMockUser({
      id: admin.id,
      role: "ADMIN",
      email: admin.email,
      isActive: true,
      clientProfile: null,
    });

    const res = await GET(
      buildRequest("00000000-0000-0000-0000-000000000000"),
      { id: "00000000-0000-0000-0000-000000000000" },
    );
    expect(res.status).toBe(404);
  });
});
