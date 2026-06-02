/**
 * Integration: cursor + search + take pagination for the admin branch of
 * GET /api/packages/client-packages. Mirrors the clients-list-paginated
 * shape (it's the same problem on a different model).
 *
 * The handler has two GET branches; only the admin one (no clientProfileId
 * param) is paginated. The per-client branch is untouched.
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

import { GET } from "@/app/api/packages/client-packages/+api";
import { prisma } from "@/lib/server/prisma";
import { now } from "@/lib/now";

function asAdmin() {
  setMockUser({
    id: "admin-1",
    role: "ADMIN",
    email: "admin@test.local",
    isActive: true,
    clientProfile: null,
  });
}

async function seedPackageType() {
  const reformer = await prisma.classType.create({
    data: { name: "Reformer", maxClients: 6, durationMins: 60 },
  });
  const packageType = await prisma.packageType.create({
    data: {
      name: "Reformer 12-pack",
      sessionCount: 12,
      validityDays: 30,
      lateCancelHours: 12,
      classTypeId: reformer.id,
    },
  });
  return { reformer, packageType };
}

async function seedClientPackages(count: number) {
  // Stable, predictable names so cursor ordering (by id asc) matches insert
  // order: it doesn't actually have to match the names, but it makes the
  // search tests deterministic.
  const { reformer, packageType } = await seedPackageType();
  const startsAt = now();
  const expiresAt = new Date(startsAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  const rows: { id: string; userId: string; fullName: string; email: string }[] = [];
  for (let i = 0; i < count; i++) {
    const idx = String(i + 1).padStart(3, "0");
    const email = `pkg-client-${idx}@test.local`;
    const user = await prisma.user.create({
      data: {
        email,
        firstName: "Pkg",
        lastName: `Client ${idx}`,
        role: "CLIENT",
        isActive: true,
      },
    });
    const profile = await prisma.clientProfile.create({
      data: { userId: user.id },
    });
    const pkg = await prisma.clientPackage.create({
      data: {
        clientProfileId: profile.id,
        packageTypeId: packageType.id,
        classTypeId: reformer.id,
        lateCancelHours: 12,
        startsAt,
        expiresAt,
        sessionsRemaining: 12,
      },
    });
    rows.push({
      id: pkg.id,
      userId: user.id,
      fullName: `${user.firstName} ${user.lastName}`,
      email: user.email,
    });
  }
  return rows;
}

type AdminListResponse = {
  success: boolean;
  packages: Array<{
    id: string;
    client: { id: string; fullName: string; email: string };
  }>;
  nextCursor: string | null;
};

describe("GET /api/packages/client-packages — admin pagination", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("paginates with cursor: take=10 returns first 10 with nextCursor", async () => {
    await seedClientPackages(25);
    asAdmin();

    const res = await GET(
      new Request("http://test.local/api/packages/client-packages?take=10"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as AdminListResponse;
    expect(body.success).toBe(true);
    expect(body.packages).toHaveLength(10);
    expect(body.nextCursor).toBeTruthy();
    expect(typeof body.nextCursor).toBe("string");
    // Cursor is the id of the last row on the current page.
    expect(body.nextCursor).toBe(body.packages[9].id);
  });

  it("follows cursor to second page with no overlap", async () => {
    await seedClientPackages(25);
    asAdmin();

    const first = await GET(
      new Request("http://test.local/api/packages/client-packages?take=10"),
    );
    const firstBody = (await first.json()) as AdminListResponse;
    const second = await GET(
      new Request(
        `http://test.local/api/packages/client-packages?take=10&cursor=${firstBody.nextCursor}`,
      ),
    );
    const secondBody = (await second.json()) as AdminListResponse;
    expect(secondBody.packages).toHaveLength(10);
    const firstIds = new Set(firstBody.packages.map((p) => p.id));
    for (const p of secondBody.packages) {
      expect(firstIds.has(p.id)).toBe(false);
    }
    expect(secondBody.nextCursor).toBe(secondBody.packages[9].id);
  });

  it("final page returns remaining items and null nextCursor", async () => {
    await seedClientPackages(25);
    asAdmin();

    const r1 = await GET(
      new Request("http://test.local/api/packages/client-packages?take=10"),
    );
    const b1 = (await r1.json()) as AdminListResponse;
    const r2 = await GET(
      new Request(
        `http://test.local/api/packages/client-packages?take=10&cursor=${b1.nextCursor}`,
      ),
    );
    const b2 = (await r2.json()) as AdminListResponse;
    const r3 = await GET(
      new Request(
        `http://test.local/api/packages/client-packages?take=10&cursor=${b2.nextCursor}`,
      ),
    );
    const b3 = (await r3.json()) as AdminListResponse;
    expect(b3.packages).toHaveLength(5);
    expect(b3.nextCursor).toBeNull();
  });

  it("default take is 20 when omitted", async () => {
    await seedClientPackages(25);
    asAdmin();
    const res = await GET(
      new Request("http://test.local/api/packages/client-packages"),
    );
    const body = (await res.json()) as AdminListResponse;
    expect(body.packages).toHaveLength(20);
    expect(body.nextCursor).toBeTruthy();
  });

  it("caps take at 100", async () => {
    await seedClientPackages(5);
    asAdmin();
    const res = await GET(
      new Request("http://test.local/api/packages/client-packages?take=500"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as AdminListResponse;
    expect(body.packages).toHaveLength(5);
    expect(body.nextCursor).toBeNull();
  });

  it("filters with ?search= by client fullName (case-insensitive)", async () => {
    await seedClientPackages(5);
    const { reformer, packageType } = await seedPackageType();
    const targetUser = await prisma.user.create({
      data: {
        email: "zebra@test.local",
        firstName: "Zebra",
        lastName: "Special",
        role: "CLIENT",
        isActive: true,
      },
    });
    const targetProfile = await prisma.clientProfile.create({
      data: { userId: targetUser.id },
    });
    const startsAt = now();
    await prisma.clientPackage.create({
      data: {
        clientProfileId: targetProfile.id,
        packageTypeId: packageType.id,
        classTypeId: reformer.id,
        lateCancelHours: 12,
        startsAt,
        expiresAt: new Date(startsAt.getTime() + 30 * 24 * 60 * 60 * 1000),
        sessionsRemaining: 12,
      },
    });
    asAdmin();

    const res = await GET(
      new Request(
        "http://test.local/api/packages/client-packages?search=zebra",
      ),
    );
    const body = (await res.json()) as AdminListResponse;
    expect(body.packages).toHaveLength(1);
    expect(body.packages[0].client.fullName).toBe("Zebra Special");
  });

  it("filters with ?search= by email substring", async () => {
    await seedClientPackages(5);
    asAdmin();
    const res = await GET(
      new Request(
        "http://test.local/api/packages/client-packages?search=pkg-client-003",
      ),
    );
    const body = (await res.json()) as AdminListResponse;
    expect(body.packages).toHaveLength(1);
    expect(body.packages[0].client.email).toBe("pkg-client-003@test.local");
  });
});
