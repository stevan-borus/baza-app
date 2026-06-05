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

  it("two concurrent dispatches deliver the campaign only ONCE (atomic claim)", async () => {
    const { admin, optedIn } = await adminAndClients();
    const campaign = await prisma.campaign.create({
      data: { createdByUserId: admin.id, title: "Hi", body: "B", audienceSpec: { everyone: true }, status: "SCHEDULED", scheduledFor: new Date() },
    });

    // Simulate the manual-send route racing a cron tick: both call dispatch
    // before either stamps the row done. Only one may win the claim.
    const results = await Promise.allSettled([
      dispatchCampaign(campaign.id),
      dispatchCampaign(campaign.id),
    ]);
    // Neither call rejects (the loser no-ops cleanly).
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);

    const logs = await prisma.notificationLog.findMany({ where: { campaignId: campaign.id } });
    expect(logs).toHaveLength(1); // opted-in client logged exactly once
    expect(sendCampaignEmailMock).toHaveBeenCalledTimes(1);

    const updated = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    expect(updated.status).toBe("SENT");
    expect(updated.recipientCount).toBe(1);
    void optedIn;
  });

  it("a SENT campaign is not re-dispatched", async () => {
    const { admin } = await adminAndClients();
    const campaign = await prisma.campaign.create({
      data: { createdByUserId: admin.id, title: "Hi", body: "B", audienceSpec: { everyone: true }, status: "SENT", sentAt: new Date(), recipientCount: 1 },
    });
    await dispatchCampaign(campaign.id);
    expect(sendCampaignEmailMock).not.toHaveBeenCalled();
  });

  it("one failing email does not abort delivery to the rest, and still stamps SENT", async () => {
    const admin = await prisma.user.create({ data: { email: "admin2@test.local", firstName: "A", lastName: "D", role: "ADMIN" } });
    async function client(email: string) {
      const user = await prisma.user.create({ data: { email, firstName: "C", lastName: email, role: "CLIENT" } });
      await prisma.clientProfile.create({ data: { userId: user.id } });
      await prisma.notificationPreference.create({ data: { userId: user.id, campaignsEnabled: true, inAppEnabled: true, pushEnabled: false } });
      return user;
    }
    await client("one@test.local");
    await client("two@test.local");
    await client("three@test.local");

    // First email send throws; the loop must isolate it and continue.
    sendCampaignEmailMock.mockRejectedValueOnce(new Error("resend boom"));

    const campaign = await prisma.campaign.create({
      data: { createdByUserId: admin.id, title: "Hi", body: "B", audienceSpec: { everyone: true }, status: "DRAFT" },
    });
    await dispatchCampaign(campaign.id);

    // All three still got the in-app notification despite one email failing.
    const logs = await prisma.notificationLog.findMany({ where: { campaignId: campaign.id } });
    expect(logs).toHaveLength(3);
    // Email attempted for all three (one rejected, two succeeded).
    expect(sendCampaignEmailMock).toHaveBeenCalledTimes(3);

    const updated = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    expect(updated.status).toBe("SENT");
    expect(updated.recipientCount).toBe(3);
  });
});
