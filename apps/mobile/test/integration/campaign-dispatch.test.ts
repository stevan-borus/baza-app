import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "./setup-db";

vi.mock("@/lib/server/resend", () => ({ sendCampaignEmail: vi.fn(async () => undefined) }));

import { dispatchCampaign } from "@/lib/server/campaign-dispatch";
import { sendCampaignEmail } from "@/lib/server/resend";
import { prisma } from "@/lib/server/prisma";

const sendCampaignEmailMock = vi.mocked(sendCampaignEmail);

async function adminAndClients() {
  const admin = await prisma.user.create({ data: { email: "admin@test.local", firstName: "A", lastName: "Dmin", role: "ADMIN" } });
  async function client(email: string, campaignsEnabled: boolean) {
    const user = await prisma.user.create({ data: { email, firstName: "C", lastName: email, role: "CLIENT" } });
    await prisma.clientProfile.create({ data: { userId: user.id } });
    await prisma.notificationPreference.create({ data: { userId: user.id, campaignsEnabled, inAppEnabled: true, pushEnabled: false } });
    return user;
  }
  const optedIn = await client("in@test.local", true);
  const optedOut = await client("out@test.local", false);
  return { admin, optedIn, optedOut };
}

describe("dispatchCampaign", () => {
  beforeEach(async () => { await resetDb(); sendCampaignEmailMock.mockClear(); });
  afterAll(async () => { await prisma.$disconnect(); });

  it("delivers to opted-in clients only and stamps SENT", async () => {
    const { admin, optedIn, optedOut } = await adminAndClients();
    const campaign = await prisma.campaign.create({
      data: { createdByUserId: admin.id, title: "Hi", body: "Promo body", audienceSpec: { everyone: true }, status: "DRAFT" },
    });
    await dispatchCampaign(campaign.id);

    const logs = await prisma.notificationLog.findMany({ where: { campaignId: campaign.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0].userId).toBe(optedIn.id);
    expect(logs[0].type).toBe("CAMPAIGN");
    expect(logs.some((l) => l.userId === optedOut.id)).toBe(false);
    expect(sendCampaignEmailMock).toHaveBeenCalledTimes(1);
    expect(sendCampaignEmailMock).toHaveBeenCalledWith(expect.objectContaining({ to: "in@test.local", subject: "Hi", bodyText: "Promo body" }));

    const updated = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    expect(updated.status).toBe("SENT");
    expect(updated.sentAt).not.toBeNull();
    expect(updated.recipientCount).toBe(1);
  });

  it("includes a unique unsubscribe link in the email", async () => {
    const { admin } = await adminAndClients();
    const campaign = await prisma.campaign.create({
      data: { createdByUserId: admin.id, title: "T", body: "B", audienceSpec: { everyone: true }, status: "DRAFT" },
    });
    await dispatchCampaign(campaign.id);
    const arg = sendCampaignEmailMock.mock.calls[0][0];
    expect(arg.unsubscribeUrl).toContain("/api/unsubscribe?token=");
  });
});
