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

import { GET } from "@/app/api/clients/+api";
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

async function seedClients(count: number) {
  // Stable, predictable, ID-sortable names. We seed with numbered names so
  // the cursor ordering (by clientProfile.id ascending) matches insertion
  // order — that lets us assert exact slices across pages.
  const created: { profileId: string; userId: string; fullName: string }[] = [];
  for (let i = 0; i < count; i++) {
    const idx = String(i + 1).padStart(3, "0");
    const user = await prisma.user.create({
      data: {
        email: `client-${idx}@test.local`,
        fullName: `Client ${idx}`,
        role: "CLIENT",
        isActive: true,
      },
    });
    const profile = await prisma.clientProfile.create({
      data: { userId: user.id },
    });
    created.push({ profileId: profile.id, userId: user.id, fullName: user.fullName });
  }
  return created;
}

type ClientResponse = {
  success: boolean;
  clients: Array<{
    id: string;
    user: { email: string; fullName: string };
  }>;
  nextCursor: string | null;
};

describe("clients API — pagination & search", () => {
  beforeEach(async () => {
    await resetDb();
  });
  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it("paginates with cursor: take=10 returns first 10 with nextCursor", async () => {
    await seedClients(25);
    asAdmin();

    const res = await GET(
      new Request("http://test.local/api/clients?take=10"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as ClientResponse;
    expect(body.success).toBe(true);
    expect(body.clients).toHaveLength(10);
    expect(body.nextCursor).toBeTruthy();
    expect(typeof body.nextCursor).toBe("string");
    // The cursor we return is the last id on the page.
    expect(body.nextCursor).toBe(body.clients[9].id);
  });

  it("follows cursor to second page", async () => {
    await seedClients(25);
    asAdmin();

    const firstRes = await GET(
      new Request("http://test.local/api/clients?take=10"),
    );
    const firstBody = (await firstRes.json()) as ClientResponse;

    const secondRes = await GET(
      new Request(
        `http://test.local/api/clients?take=10&cursor=${firstBody.nextCursor}`,
      ),
    );
    const secondBody = (await secondRes.json()) as ClientResponse;
    expect(secondBody.clients).toHaveLength(10);
    // No overlap between pages.
    const firstIds = new Set(firstBody.clients.map((c) => c.id));
    for (const c of secondBody.clients) {
      expect(firstIds.has(c.id)).toBe(false);
    }
    expect(secondBody.nextCursor).toBe(secondBody.clients[9].id);
  });

  it("final page returns remaining items and null nextCursor", async () => {
    await seedClients(25);
    asAdmin();

    const r1 = await GET(new Request("http://test.local/api/clients?take=10"));
    const b1 = (await r1.json()) as ClientResponse;
    const r2 = await GET(
      new Request(`http://test.local/api/clients?take=10&cursor=${b1.nextCursor}`),
    );
    const b2 = (await r2.json()) as ClientResponse;
    const r3 = await GET(
      new Request(`http://test.local/api/clients?take=10&cursor=${b2.nextCursor}`),
    );
    const b3 = (await r3.json()) as ClientResponse;
    expect(b3.clients).toHaveLength(5);
    expect(b3.nextCursor).toBeNull();
  });

  it("filters with ?q= by fullName (case-insensitive)", async () => {
    // Seed 25 numbered clients + 1 "Zebra Special" that's easy to target.
    await seedClients(25);
    const targetUser = await prisma.user.create({
      data: {
        email: "zebra@test.local",
        fullName: "Zebra Special",
        role: "CLIENT",
        isActive: true,
      },
    });
    await prisma.clientProfile.create({ data: { userId: targetUser.id } });
    asAdmin();

    const res = await GET(
      new Request("http://test.local/api/clients?q=zebra"),
    );
    const body = (await res.json()) as ClientResponse;
    expect(body.clients).toHaveLength(1);
    expect(body.clients[0].user.fullName).toBe("Zebra Special");
  });

  it("filters with ?q= by email", async () => {
    await seedClients(5);
    asAdmin();
    const res = await GET(
      new Request("http://test.local/api/clients?q=client-003"),
    );
    const body = (await res.json()) as ClientResponse;
    expect(body.clients).toHaveLength(1);
    expect(body.clients[0].user.email).toBe("client-003@test.local");
  });

  it("empty q returns first page unfiltered (no q filter applied)", async () => {
    await seedClients(25);
    asAdmin();
    const res = await GET(
      new Request("http://test.local/api/clients?q=&take=20"),
    );
    const body = (await res.json()) as ClientResponse;
    expect(body.clients).toHaveLength(20);
    expect(body.nextCursor).toBeTruthy();
  });

  it("caps take at 100", async () => {
    await seedClients(5);
    asAdmin();
    const res = await GET(
      new Request("http://test.local/api/clients?take=500"),
    );
    expect(res.status).toBe(200);
    // We seeded 5 — capping take at 100 means we still get all 5 here, but
    // crucially the request doesn't 400.
    const body = (await res.json()) as ClientResponse;
    expect(body.clients).toHaveLength(5);
    expect(body.nextCursor).toBeNull();
  });

  it("default take is 20 when omitted", async () => {
    await seedClients(25);
    asAdmin();
    const res = await GET(new Request("http://test.local/api/clients"));
    const body = (await res.json()) as ClientResponse;
    expect(body.clients).toHaveLength(20);
    expect(body.nextCursor).toBeTruthy();
  });
});
