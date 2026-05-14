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

import { POST } from "@/app/api/admin/clients/[id]/guardian-verified+api";
import { prisma } from "@/lib/server/prisma";
import { resetDb } from "./setup-db";

describe("POST /api/admin/clients/:id/guardian-verified", () => {
  let adminId: string;
  let minorClientUserId: string;

  beforeEach(async () => {
    await resetDb();

    const admin = await prisma.user.create({
      data: { email: "a@t.local", fullName: "Admin", role: "ADMIN" },
    });
    const minor = await prisma.user.create({
      data: {
        email: "m@t.local",
        fullName: "Minor",
        role: "CLIENT",
        clientProfile: { create: { dateOfBirth: new Date(2015, 0, 1) } },
      },
    });
    adminId = admin.id;
    minorClientUserId = minor.id;
    setMockUser({
      id: admin.id,
      role: "ADMIN",
      email: admin.email,
      isActive: true,
      clientProfile: null,
    });

    await prisma.consentRecord.create({
      data: {
        userId: minor.id,
        documentKey: "waiver_minor",
        version: 1,
        locale: "sr",
        accepted: true,
        guardianName: "Mama",
        guardianRelation: "parent",
      },
    });
  });

  it("sets guardianVerifiedAt + guardianVerifiedById on the minor's waiver record", async () => {
    const res = await POST(
      new Request(
        `https://t.local/api/admin/clients/${minorClientUserId}/guardian-verified`,
        { method: "POST" },
      ),
      { params: { id: minorClientUserId } },
    );
    expect(res.status).toBe(200);
    const row = await prisma.consentRecord.findFirst({
      where: { userId: minorClientUserId, documentKey: "waiver_minor" },
    });
    expect(row?.guardianVerifiedAt).toBeTruthy();
    expect(row?.guardianVerifiedById).toBe(adminId);
  });

  it("404 when client has no waiver_minor record", async () => {
    const otherClient = await prisma.user.create({
      data: { email: "o@t.local", fullName: "Other", role: "CLIENT", clientProfile: { create: { dateOfBirth: new Date("1990-01-01") } } },
    });
    const res = await POST(
      new Request(
        `https://t.local/api/admin/clients/${otherClient.id}/guardian-verified`,
        { method: "POST" },
      ),
      { params: { id: otherClient.id } },
    );
    expect(res.status).toBe(404);
  });

  it("403 when caller is not an admin", async () => {
    setMockUser({
      id: minorClientUserId,
      role: "CLIENT",
      email: "m@t.local",
      isActive: true,
      clientProfile: { id: "x" },
    });
    const res = await POST(
      new Request(
        `https://t.local/api/admin/clients/${minorClientUserId}/guardian-verified`,
        { method: "POST" },
      ),
      { params: { id: minorClientUserId } },
    );
    expect(res.status).toBe(403);
  });
});
