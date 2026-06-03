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

describe("POST + GET /api/campaigns", () => {
  beforeEach(async () => { await resetDb(); });
  it("creates a DRAFT when neither scheduledFor nor sendNow is given", async () => {
    const { admin } = await seedAdminAndClients(); asAdmin(admin);
    const res = await CREATE(new Request("http://test.local/api/campaigns", { method: "POST", body: JSON.stringify({ title: "T", body: "B", audienceSpec: { everyone: true } }) }));
    const b = await res.json();
    expect(b.campaign.status).toBe("DRAFT");
    expect(b.campaign.sentAt).toBeNull();
  });
  it("creates a SCHEDULED campaign when scheduledFor is given", async () => {
    const { admin } = await seedAdminAndClients(); asAdmin(admin);
    const res = await CREATE(new Request("http://test.local/api/campaigns", { method: "POST", body: JSON.stringify({ title: "T", body: "B", audienceSpec: { everyone: true }, scheduledFor: "2026-08-01T09:00:00.000Z" }) }));
    expect((await res.json()).campaign.status).toBe("SCHEDULED");
  });
  it("dispatches immediately and returns SENT when sendNow is true", async () => {
    const { admin } = await seedAdminAndClients(); asAdmin(admin);
    const res = await CREATE(new Request("http://test.local/api/campaigns", { method: "POST", body: JSON.stringify({ title: "T", body: "B", audienceSpec: { everyone: true }, sendNow: true }) }));
    const b = await res.json();
    expect(b.campaign.status).toBe("SENT");
    expect(b.campaign.recipientCount).toBe(2);
  });
  it("lists campaigns newest first", async () => {
    const { admin } = await seedAdminAndClients(); asAdmin(admin);
    // Distinct createdAt so "newest first" ordering is deterministic — two
    // back-to-back creates can otherwise share a timestamp and tie.
    await prisma.campaign.create({ data: { createdByUserId: admin.id, title: "old", body: "b", audienceSpec: { everyone: true }, status: "DRAFT", createdAt: new Date("2026-01-01T00:00:00Z") } });
    await prisma.campaign.create({ data: { createdByUserId: admin.id, title: "new", body: "b", audienceSpec: { everyone: true }, status: "DRAFT", createdAt: new Date("2026-01-02T00:00:00Z") } });
    const res = await LIST(new Request("http://test.local/api/campaigns"));
    const b = await res.json();
    expect(b.campaigns[0].title).toBe("new");
    expect(b.campaigns).toHaveLength(2);
  });
});

describe("/api/campaigns/[id]", () => {
  beforeEach(async () => { await resetDb(); });
  it("GET returns one campaign", async () => {
    const { admin } = await seedAdminAndClients(); asAdmin(admin);
    const c = await prisma.campaign.create({ data: { createdByUserId: admin.id, title: "T", body: "B", audienceSpec: { everyone: true }, status: "DRAFT" } });
    const res = await GET_ONE(new Request(`http://test.local/api/campaigns/${c.id}`), { params: { id: c.id } });
    expect((await res.json()).campaign.id).toBe(c.id);
  });
  it("PATCH edits a DRAFT", async () => {
    const { admin } = await seedAdminAndClients(); asAdmin(admin);
    const c = await prisma.campaign.create({ data: { createdByUserId: admin.id, title: "old", body: "B", audienceSpec: { everyone: true }, status: "DRAFT" } });
    const res = await PATCH(new Request(`http://test.local/api/campaigns/${c.id}`, { method: "PATCH", body: JSON.stringify({ title: "new" }) }), { params: { id: c.id } });
    expect((await res.json()).campaign.title).toBe("new");
  });
  it("PATCH cancels a SCHEDULED campaign back to DRAFT", async () => {
    const { admin } = await seedAdminAndClients(); asAdmin(admin);
    const c = await prisma.campaign.create({ data: { createdByUserId: admin.id, title: "T", body: "B", audienceSpec: { everyone: true }, status: "SCHEDULED", scheduledFor: new Date("2026-09-01T09:00:00Z") } });
    const res = await PATCH(new Request(`http://test.local/api/campaigns/${c.id}`, { method: "PATCH", body: JSON.stringify({ status: "DRAFT" }) }), { params: { id: c.id } });
    const b = await res.json();
    expect(b.campaign.status).toBe("DRAFT");
    expect(b.campaign.scheduledFor).toBeNull();
  });
  it("PATCH refuses to edit a SENT campaign", async () => {
    const { admin } = await seedAdminAndClients(); asAdmin(admin);
    const c = await prisma.campaign.create({ data: { createdByUserId: admin.id, title: "T", body: "B", audienceSpec: { everyone: true }, status: "SENT", sentAt: new Date() } });
    const res = await PATCH(new Request(`http://test.local/api/campaigns/${c.id}`, { method: "PATCH", body: JSON.stringify({ title: "x" }) }), { params: { id: c.id } });
    expect(res.status).toBe(409);
  });
  it("DELETE removes a DRAFT", async () => {
    const { admin } = await seedAdminAndClients(); asAdmin(admin);
    const c = await prisma.campaign.create({ data: { createdByUserId: admin.id, title: "T", body: "B", audienceSpec: { everyone: true }, status: "DRAFT" } });
    const res = await DELETE(new Request(`http://test.local/api/campaigns/${c.id}`, { method: "DELETE" }), { params: { id: c.id } });
    expect(res.status).toBe(200);
    expect(await prisma.campaign.findUnique({ where: { id: c.id } })).toBeNull();
  });
  it("DELETE refuses a SENT campaign", async () => {
    const { admin } = await seedAdminAndClients(); asAdmin(admin);
    const c = await prisma.campaign.create({ data: { createdByUserId: admin.id, title: "T", body: "B", audienceSpec: { everyone: true }, status: "SENT", sentAt: new Date() } });
    const res = await DELETE(new Request(`http://test.local/api/campaigns/${c.id}`, { method: "DELETE" }), { params: { id: c.id } });
    expect(res.status).toBe(409);
  });

  it("GET/PATCH/DELETE 404 for a missing campaign id", async () => {
    const { admin } = await seedAdminAndClients(); asAdmin(admin);
    const missing = "00000000-0000-0000-0000-000000000000";
    const getRes = await GET_ONE(new Request(`http://test.local/api/campaigns/${missing}`), { params: { id: missing } });
    expect(getRes.status).toBe(404);
    const patchRes = await PATCH(new Request(`http://test.local/api/campaigns/${missing}`, { method: "PATCH", body: JSON.stringify({ title: "x" }) }), { params: { id: missing } });
    expect(patchRes.status).toBe(404);
    const delRes = await DELETE(new Request(`http://test.local/api/campaigns/${missing}`, { method: "DELETE" }), { params: { id: missing } });
    expect(delRes.status).toBe(404);
  });
});

describe("POST /api/campaigns/[id]/send", () => {
  beforeEach(async () => { await resetDb(); });
  it("dispatches a DRAFT and marks it SENT", async () => {
    const { admin } = await seedAdminAndClients(); asAdmin(admin);
    const c = await prisma.campaign.create({ data: { createdByUserId: admin.id, title: "T", body: "B", audienceSpec: { everyone: true }, status: "DRAFT" } });
    const res = await SEND(new Request(`http://test.local/api/campaigns/${c.id}/send`, { method: "POST" }), { params: { id: c.id } });
    const b = await res.json();
    expect(b.campaign.status).toBe("SENT");
    expect(b.campaign.recipientCount).toBe(2);
    // Full campaign shape (same as every other single-campaign response).
    expect(b.campaign.title).toBe("T");
    expect(b.campaign.body).toBe("B");
  });
  it("refuses to re-send a SENT campaign", async () => {
    const { admin } = await seedAdminAndClients(); asAdmin(admin);
    const c = await prisma.campaign.create({ data: { createdByUserId: admin.id, title: "T", body: "B", audienceSpec: { everyone: true }, status: "SENT", sentAt: new Date() } });
    const res = await SEND(new Request(`http://test.local/api/campaigns/${c.id}/send`, { method: "POST" }), { params: { id: c.id } });
    expect(res.status).toBe(409);
  });
  it("404 for a missing campaign id", async () => {
    const { admin } = await seedAdminAndClients(); asAdmin(admin);
    const missing = "00000000-0000-0000-0000-000000000000";
    const res = await SEND(new Request(`http://test.local/api/campaigns/${missing}/send`, { method: "POST" }), { params: { id: missing } });
    expect(res.status).toBe(404);
  });
});
