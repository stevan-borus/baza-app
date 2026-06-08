import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { now } from "@/lib/now";
import { resetDb } from "./setup-db";
vi.mock("@/lib/server/resend", () => ({ sendCampaignEmail: vi.fn(async () => undefined) }));
import { POST as CRON } from "@/app/api/cron/campaigns/dispatch/+api";
import { prisma } from "@/lib/server/prisma";

const TOKEN = process.env.API_ADMIN_BOOTSTRAP_TOKEN ?? "test-bootstrap-token";

async function seed() {
  const admin = await prisma.user.create({ data: { email: "admin@test.local", firstName: "A", lastName: "D", role: "ADMIN" } });
  const u = await prisma.user.create({ data: { email: "c@test.local", firstName: "C", lastName: "L", role: "CLIENT" } });
  await prisma.clientProfile.create({ data: { userId: u.id } });
  await prisma.notificationPreference.create({ data: { userId: u.id, campaignsEnabled: true } });
  return { admin };
}
function cronReq(qs = "") {
  return new Request(`http://test.local/api/cron/campaigns/dispatch${qs}`, { method: "POST", headers: { "x-cron-token": TOKEN } });
}

describe("POST /api/cron/campaigns/dispatch", () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await prisma.$disconnect(); });
  it("401s without the cron token", async () => {
    const res = await CRON(new Request("http://test.local/api/cron/campaigns/dispatch", { method: "POST" }));
    expect(res.status).toBe(401);
  });
  it("dispatches due SCHEDULED campaigns and flips them SENT", async () => {
    const { admin } = await seed();
    const due = await prisma.campaign.create({ data: { createdByUserId: admin.id, title: "Due", body: "B", audienceSpec: { everyone: true }, status: "SCHEDULED", scheduledFor: new Date(now().getTime() - 60_000) } });
    const notYet = await prisma.campaign.create({ data: { createdByUserId: admin.id, title: "Later", body: "B", audienceSpec: { everyone: true }, status: "SCHEDULED", scheduledFor: new Date(now().getTime() + 60 * 60_000) } });
    const res = await CRON(cronReq());
    expect((await res.json()).dispatched).toBe(1);
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: due.id } })).status).toBe("SENT");
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: notYet.id } })).status).toBe("SCHEDULED");
  });
  it("dryRun reports due campaigns but dispatches nothing", async () => {
    const { admin } = await seed();
    const due = await prisma.campaign.create({ data: { createdByUserId: admin.id, title: "Due", body: "B", audienceSpec: { everyone: true }, status: "SCHEDULED", scheduledFor: new Date(now().getTime() - 60_000) } });
    const res = await CRON(cronReq("?dryRun=true"));
    const b = await res.json();
    expect(b.dryRun).toBe(true);
    expect(b.dispatched).toBe(1);
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: due.id } })).status).toBe("SCHEDULED");
    expect(await prisma.notificationLog.count()).toBe(0);
  });
});
