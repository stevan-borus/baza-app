import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

import { GET } from "@/server/routes/packages/client-packages";
import { prisma } from "@/lib/server/prisma";
import { now } from "@/lib/now";

async function seedTwoClientsTwoPackages() {
  const admin = await prisma.user.create({
    data: { email: "admin@test.local", firstName: "Admin", lastName: "Test", role: "ADMIN" },
  });
  const reformer = await prisma.classType.create({
    data: { name: "Reformer", maxClients: 6, durationMins: 60 },
  });
  const r12 = await prisma.packageType.create({
    data: {
      name: "Reformer 12",
      sessionCount: 12,
      validityDays: 30,
      lateCancelHours: 12,
      classTypeId: reformer.id,
    },
  });
  const ana = await prisma.user.create({
    data: { email: "ana@test.local", firstName: "Ana", lastName: "Anić", role: "CLIENT" },
  });
  const anaProfile = await prisma.clientProfile.create({ data: { userId: ana.id } });
  const milos = await prisma.user.create({
    data: { email: "milos@test.local", firstName: "Miloš", lastName: "Mitrović", role: "CLIENT" },
  });
  const milosProfile = await prisma.clientProfile.create({ data: { userId: milos.id } });
  const startsAt = now();
  const expiresAt = new Date(startsAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  await prisma.clientPackage.create({
    data: {
      clientProfileId: anaProfile.id,
      packageTypeId: r12.id,
      classTypeId: reformer.id,
      lateCancelHours: 12,
      startsAt,
      expiresAt,
      sessionsRemaining: 12,
    },
  });
  await prisma.clientPackage.create({
    data: {
      clientProfileId: milosProfile.id,
      packageTypeId: r12.id,
      classTypeId: reformer.id,
      lateCancelHours: 12,
      startsAt,
      expiresAt,
      sessionsRemaining: 8,
    },
  });
  return { admin, ana, milos };
}

function asAdmin(admin: { id: string; email: string }) {
  setMockUser({
    id: admin.id,
    role: "ADMIN",
    email: admin.email,
    isActive: true,
    clientProfile: null,
  });
}

describe("GET /api/packages/client-packages — admin listing", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("admin list includes client name + email on each ClientPackage row", async () => {
    const { admin } = await seedTwoClientsTwoPackages();
    asAdmin(admin);
    const response = await GET(
      new Request("http://test.local/api/packages/client-packages"),
    );
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.packages).toHaveLength(2);
    const first = body.packages[0];
    expect(first.client).toEqual(
      expect.objectContaining({ fullName: expect.any(String), email: expect.any(String) }),
    );
  });

  it("filters admin list by client search (name or email substring, case-insensitive)", async () => {
    const { admin } = await seedTwoClientsTwoPackages();
    asAdmin(admin);
    const response = await GET(
      new Request("http://test.local/api/packages/client-packages?search=ana"),
    );
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.packages).toHaveLength(1);
    expect(body.packages[0].client.fullName).toBe("Ana Anić");
  });

  it("search by email substring returns the matching client's packages", async () => {
    const { admin } = await seedTwoClientsTwoPackages();
    asAdmin(admin);
    const response = await GET(
      new Request("http://test.local/api/packages/client-packages?search=milos"),
    );
    const body = await response.json();
    expect(body.packages).toHaveLength(1);
    expect(body.packages[0].client.email).toBe("milos@test.local");
  });
});
