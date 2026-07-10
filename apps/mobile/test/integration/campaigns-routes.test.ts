import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMockUser } from "./auth-mock";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/auth-guards", async () => (await import("./auth-mock")).authGuardsMock());

vi.mock("@/lib/server/resend", () => ({ sendCampaignEmail: vi.fn(async () => undefined) }));

import { POST as PREVIEW } from "@/server/routes/campaigns/preview";
import { POST as PREVIEW_CLIENTS } from "@/server/routes/campaigns/preview/clients";
import { GET as LIST, POST as CREATE } from "@/server/routes/campaigns";
import { GET as GET_ONE, PATCH, DELETE } from "@/server/routes/campaigns/[id]";
import { POST as SEND } from "@/server/routes/campaigns/[id]/send";
import { GET as RECIPIENTS } from "@/server/routes/campaigns/[id]/recipients";
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

describe("POST /api/campaigns/preview/clients", () => {
  beforeEach(async () => { await resetDb(); });

  it("returns the matching clients with name/email + opted-out flag", async () => {
    const admin = await prisma.user.create({ data: { email: "admin@test.local", firstName: "A", lastName: "D", role: "ADMIN" } });
    const inUser = await prisma.user.create({ data: { email: "in@test.local", firstName: "Ana", lastName: "Aaa", role: "CLIENT" } });
    await prisma.clientProfile.create({ data: { userId: inUser.id } });
    await prisma.notificationPreference.create({ data: { userId: inUser.id, campaignsEnabled: true } });
    const outUser = await prisma.user.create({ data: { email: "out@test.local", firstName: "Bo", lastName: "Bbb", role: "CLIENT" } });
    await prisma.clientProfile.create({ data: { userId: outUser.id } });
    await prisma.notificationPreference.create({ data: { userId: outUser.id, campaignsEnabled: false } });

    asAdmin(admin);
    const res = await PREVIEW_CLIENTS(new Request("http://test.local/api/campaigns/preview/clients", { method: "POST", body: JSON.stringify({ everyone: true }) }));
    expect(res.status).toBe(200);
    const { clients } = await res.json();
    expect(clients).toHaveLength(2); // reach counts opted-out clients too
    const out = clients.find((c: { email: string }) => c.email === "out@test.local");
    expect(out.fullName).toBe("Bo Bbb");
    expect(out.campaignsEnabled).toBe(false);
    const inc = clients.find((c: { email: string }) => c.email === "in@test.local");
    expect(inc.campaignsEnabled).toBe(true);
  });

  it("403s for a non-admin", async () => {
    asClient();
    const res = await PREVIEW_CLIENTS(new Request("http://test.local/api/campaigns/preview/clients", { method: "POST", body: JSON.stringify({ everyone: true }) }));
    expect(res.status).toBe(403);
  });
});

describe("GET /api/campaigns/[id]/recipients", () => {
  beforeEach(async () => { await resetDb(); });

  it("projects the saved spec for a DRAFT (actual=false)", async () => {
    const { admin } = await seedAdminAndClients(); asAdmin(admin);
    const c = await prisma.campaign.create({ data: { createdByUserId: admin.id, title: "T", body: "B", audienceSpec: { everyone: true }, status: "DRAFT" } });
    const res = await RECIPIENTS(new Request(`http://test.local/api/campaigns/${c.id}/recipients`), { params: { id: c.id } });
    const body = await res.json();
    expect(body.actual).toBe(false);
    expect(body.clients).toHaveLength(2);
  });

  it("returns the ACTUAL recipients for a SENT campaign from the notification log", async () => {
    const { admin } = await seedAdminAndClients(); asAdmin(admin);
    const c = await prisma.campaign.create({ data: { createdByUserId: admin.id, title: "T", body: "B", audienceSpec: { everyone: true }, status: "SENT", sentAt: new Date(), recipientCount: 1 } });
    // Only ONE of the two clients actually got a log row (e.g. the other opted
    // out at dispatch). The recipients list must reflect the log, not the spec.
    const onlyOne = await prisma.user.findFirstOrThrow({ where: { role: "CLIENT" }, select: { id: true } });
    await prisma.notificationLog.create({ data: { userId: onlyOne.id, type: "CAMPAIGN", title: "T", body: "B", campaignId: c.id } });

    const res = await RECIPIENTS(new Request(`http://test.local/api/campaigns/${c.id}/recipients`), { params: { id: c.id } });
    const body = await res.json();
    expect(body.actual).toBe(true);
    expect(body.clients).toHaveLength(1);
    expect(body.clients[0].id).toBe(onlyOne.id);
  });

  it("404s for a missing campaign", async () => {
    const { admin } = await seedAdminAndClients(); asAdmin(admin);
    const res = await RECIPIENTS(new Request("http://test.local/api/campaigns/00000000-0000-0000-0000-000000000000/recipients"), { params: { id: "00000000-0000-0000-0000-000000000000" } });
    expect(res.status).toBe(404);
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
  it("rejects creating a campaign scheduled in the past", async () => {
    const { admin } = await seedAdminAndClients(); asAdmin(admin);
    // Anchor is 2026-05-09T10:00:00Z; this is in the past → would fire on the
    // next cron tick as a surprise send-now, bypassing the review window.
    const res = await CREATE(new Request("http://test.local/api/campaigns", { method: "POST", body: JSON.stringify({ title: "T", body: "B", audienceSpec: { everyone: true }, scheduledFor: "2026-05-01T09:00:00.000Z" }) }));
    expect(res.status).toBe(400);
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
  it("PATCH refuses status=SCHEDULED without a scheduledFor (would never fire)", async () => {
    const { admin } = await seedAdminAndClients(); asAdmin(admin);
    // A DRAFT with no scheduledFor. Promoting it to SCHEDULED without supplying
    // a scheduledFor would leave the cron (scheduledFor <= now) unable to ever
    // match it — a campaign that silently never sends.
    const c = await prisma.campaign.create({ data: { createdByUserId: admin.id, title: "T", body: "B", audienceSpec: { everyone: true }, status: "DRAFT" } });
    const res = await PATCH(new Request(`http://test.local/api/campaigns/${c.id}`, { method: "PATCH", body: JSON.stringify({ status: "SCHEDULED" }) }), { params: { id: c.id } });
    expect(res.status).toBe(400);
    const after = await prisma.campaign.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.status).toBe("DRAFT");
  });
  it("PATCH accepts status=SCHEDULED when a future scheduledFor is supplied in the same call", async () => {
    const { admin } = await seedAdminAndClients(); asAdmin(admin);
    const c = await prisma.campaign.create({ data: { createdByUserId: admin.id, title: "T", body: "B", audienceSpec: { everyone: true }, status: "DRAFT" } });
    const res = await PATCH(new Request(`http://test.local/api/campaigns/${c.id}`, { method: "PATCH", body: JSON.stringify({ status: "SCHEDULED", scheduledFor: "2026-08-01T09:00:00.000Z" }) }), { params: { id: c.id } });
    expect(res.status).toBe(200);
    expect((await res.json()).campaign.status).toBe("SCHEDULED");
  });
  it("PATCH rejects a scheduledFor in the past", async () => {
    const { admin } = await seedAdminAndClients(); asAdmin(admin);
    const c = await prisma.campaign.create({ data: { createdByUserId: admin.id, title: "T", body: "B", audienceSpec: { everyone: true }, status: "DRAFT" } });
    // Anchor is 2026-05-09T10:00:00Z; this instant is in the past.
    const res = await PATCH(new Request(`http://test.local/api/campaigns/${c.id}`, { method: "PATCH", body: JSON.stringify({ status: "SCHEDULED", scheduledFor: "2026-05-01T09:00:00.000Z" }) }), { params: { id: c.id } });
    expect(res.status).toBe(400);
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
