import { describe, expect, it } from "vitest";
import {
  campaignAudienceClientsResponseSchema,
  campaignDeleteResponseSchema,
  campaignPreviewResponseSchema,
  campaignRecipientsResponseSchema,
  campaignResponseSchema,
  campaignSchema,
  campaignsListResponseSchema,
} from "../src/campaigns";

/** A campaign as it crosses the wire (CAMPAIGN_SELECT, JSON-serialized). */
const wireCampaign = {
  id: "c1",
  title: "Summer offer",
  body: "20% off Reformer packs this week.",
  audienceSpec: { everyone: true },
  recipientCount: 12,
  status: "DRAFT",
  scheduledFor: null,
  sentAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const wireClient = {
  id: "u1",
  fullName: "Ana Anić",
  email: "ana@example.com",
  campaignsEnabled: true,
};

describe("campaignSchema", () => {
  it("accepts a serialized CAMPAIGN_SELECT row", () => {
    expect(campaignSchema.safeParse(wireCampaign).success).toBe(true);
  });
  it("rejects an unknown status", () => {
    expect(campaignSchema.safeParse({ ...wireCampaign, status: "PAUSED" }).success).toBe(false);
  });
});

describe("campaign response envelopes", () => {
  it("campaignsListResponseSchema accepts { campaigns: [...] }", () => {
    expect(campaignsListResponseSchema.safeParse({ campaigns: [wireCampaign] }).success).toBe(true);
  });
  it("campaignResponseSchema accepts { campaign }", () => {
    expect(campaignResponseSchema.safeParse({ campaign: wireCampaign }).success).toBe(true);
  });
  it("campaignPreviewResponseSchema requires a numeric count", () => {
    expect(campaignPreviewResponseSchema.safeParse({ count: 3 }).success).toBe(true);
    expect(campaignPreviewResponseSchema.safeParse({}).success).toBe(false);
  });
  it("campaignAudienceClientsResponseSchema accepts { clients: [...] }", () => {
    expect(campaignAudienceClientsResponseSchema.safeParse({ clients: [wireClient] }).success).toBe(true);
  });
  it("campaignRecipientsResponseSchema requires the actual flag", () => {
    expect(
      campaignRecipientsResponseSchema.safeParse({ actual: true, clients: [wireClient] }).success,
    ).toBe(true);
    expect(campaignRecipientsResponseSchema.safeParse({ clients: [wireClient] }).success).toBe(false);
  });
  it("campaignDeleteResponseSchema accepts { success: true }", () => {
    expect(campaignDeleteResponseSchema.safeParse({ success: true }).success).toBe(true);
  });
});
