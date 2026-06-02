import { describe, it, expect, beforeEach, vi } from "vitest";
import { setMockUser } from "./auth-mock";

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

import { GET } from "@/app/api/admin/clients/[id]/consent-records+api";
import { prisma } from "@/lib/server/prisma";
import { resetDb } from "./setup-db";

describe("GET /api/admin/clients/:id/consent-records", () => {
  let clientUserId: string;

  beforeEach(async () => {
    await resetDb();

    const admin = await prisma.user.create({
      data: { email: "a@t.local", firstName: "Admin", lastName: "Test", role: "ADMIN" },
    });
    const client = await prisma.user.create({
      data: {
        email: "c@t.local",
        firstName: "Client",
        lastName: "Test",
        role: "CLIENT",
        clientProfile: { create: { dateOfBirth: new Date(1990, 0, 1) } },
      },
    });
    clientUserId = client.id;

    setMockUser({
      id: admin.id,
      role: "ADMIN",
      email: admin.email,
      isActive: true,
      clientProfile: null,
    });

    await prisma.consentRecord.createMany({
      data: [
        {
          userId: client.id,
          documentKey: "tos",
          version: 1,
          locale: "en",
          accepted: true,
        },
        {
          userId: client.id,
          documentKey: "waiver_adult",
          version: 1,
          locale: "en",
          accepted: true,
        },
        // This one is NOT accepted — should be excluded
        {
          userId: client.id,
          documentKey: "privacy",
          version: 1,
          locale: "en",
          accepted: false,
        },
      ],
    });
  });

  it("returns only accepted consent records for a client", async () => {
    const res = await GET(
      new Request(`https://t.local/api/admin/clients/${clientUserId}/consent-records`),
      { params: { id: clientUserId } },
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { records: Array<{ documentKey: string; accepted?: boolean }> };
    expect(body.records).toHaveLength(2);
    const keys = body.records.map((r) => r.documentKey);
    expect(keys).toContain("tos");
    expect(keys).toContain("waiver_adult");
    expect(keys).not.toContain("privacy");
  });

  it("returns empty array when client has no accepted records", async () => {
    const otherClient = await prisma.user.create({
      data: {
        email: "o@t.local",
        firstName: "Other",
        lastName: "Test",
        role: "CLIENT",
        clientProfile: { create: { dateOfBirth: new Date("1985-06-15") } },
      },
    });
    const res = await GET(
      new Request(`https://t.local/api/admin/clients/${otherClient.id}/consent-records`),
      { params: { id: otherClient.id } },
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { records: unknown[] };
    expect(body.records).toHaveLength(0);
  });

  it("includes guardianVerifiedAt in the response shape", async () => {
    const res = await GET(
      new Request(`https://t.local/api/admin/clients/${clientUserId}/consent-records`),
      { params: { id: clientUserId } },
    );
    const body = await res.json() as { records: Array<{ id: string; documentKey: string; version: number; acceptedAt: string; guardianVerifiedAt: string | null }> };
    for (const r of body.records) {
      expect(r).toHaveProperty("id");
      expect(r).toHaveProperty("documentKey");
      expect(r).toHaveProperty("version");
      expect(r).toHaveProperty("acceptedAt");
      expect(r).toHaveProperty("guardianVerifiedAt");
    }
  });

  it("403 when caller is not an admin", async () => {
    setMockUser({
      id: clientUserId,
      role: "CLIENT",
      email: "c@t.local",
      isActive: true,
      clientProfile: { id: "x" },
    });
    const res = await GET(
      new Request(`https://t.local/api/admin/clients/${clientUserId}/consent-records`),
      { params: { id: clientUserId } },
    );
    expect(res.status).toBe(403);
  });
});
