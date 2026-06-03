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

vi.mock("@/lib/server/resend", () => ({ sendCampaignEmail: vi.fn(async () => undefined) }));

import { POST as PREVIEW } from "@/app/api/campaigns/preview/+api";
import { GET as LIST, POST as CREATE } from "@/app/api/campaigns/+api";
import { GET as GET_ONE, PATCH, DELETE } from "@/app/api/campaigns/[id]/+api";
import { POST as SEND } from "@/app/api/campaigns/[id]/send/+api";
import { prisma } from "@/lib/server/prisma";

async function seedAdminAndClients() {
  const admin = await prisma.user.create({ data: { email: "admin@test.local", firstName: "A", lastName: "D", role: "ADMIN" } });
  for (const email of ["c1@test.local", "c2@test.local"]) {
    const u = await prisma.user.create({ data: { email, firstName: "C", lastName: email, role: "CLIENT" } });
    await prisma.clientProfile.create({ data: { userId: u.id } });
    await prisma.notificationPreference.create({ data: { userId: u.id, campaignsEnabled: true } });
  }
  return { admin };
}
function asAdmin(admin: { id: string; email: string }) {
  setMockUser({ id: admin.id, role: "ADMIN", email: admin.email, isActive: true, clientProfile: null });
}
function asClient() {
  setMockUser({ id: "client-x", role: "CLIENT", email: "x@test.local", isActive: true, clientProfile: { id: "p" } });
}

describe("POST /api/campaigns/preview", () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await prisma.$disconnect(); });
  it("returns the live audience count for everyone", async () => {
    const { admin } = await seedAdminAndClients();
    asAdmin(admin);
    const res = await PREVIEW(new Request("http://test.local/api/campaigns/preview", { method: "POST", body: JSON.stringify({ everyone: true }) }));
    expect((await res.json()).count).toBe(2);
  });
  it("403s for a non-admin", async () => {
    asClient();
    const res = await PREVIEW(new Request("http://test.local/api/campaigns/preview", { method: "POST", body: JSON.stringify({ everyone: true }) }));
    expect(res.status).toBe(403);
  });
});
