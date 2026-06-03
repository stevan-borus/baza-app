import { describe, expect, it } from "vitest";
import {
  campaignAudienceSpecSchema,
  createCampaignInputSchema,
} from "../src/index";

describe("campaignAudienceSpecSchema", () => {
  it("accepts everyone alone", () => {
    expect(campaignAudienceSpecSchema.safeParse({ everyone: true }).success).toBe(true);
  });
  it("rejects everyone combined with a narrowing axis", () => {
    expect(campaignAudienceSpecSchema.safeParse({ everyone: true, packageState: "active" }).success).toBe(false);
  });
  it("accepts a combination of narrowing axes", () => {
    expect(campaignAudienceSpecSchema.safeParse({
      packageState: "active",
      classTypeId: "11111111-1111-1111-1111-111111111111",
      expiringSoonDays: 7,
    }).success).toBe(true);
  });
  it("rejects a non-positive N-day window", () => {
    expect(campaignAudienceSpecSchema.safeParse({ lapsedDays: 0 }).success).toBe(false);
  });
  it("rejects an empty spec (no axis chosen)", () => {
    expect(campaignAudienceSpecSchema.safeParse({}).success).toBe(false);
  });
});

describe("createCampaignInputSchema", () => {
  it("accepts a draft with title, body, audienceSpec and no schedule", () => {
    expect(createCampaignInputSchema.safeParse({
      title: "Summer offer", body: "20% off Reformer packs this week.", audienceSpec: { everyone: true },
    }).success).toBe(true);
  });
  it("accepts a scheduledFor ISO string", () => {
    expect(createCampaignInputSchema.safeParse({
      title: "Later", body: "Scheduled body", audienceSpec: { everyone: true }, scheduledFor: "2026-07-01T09:00:00.000Z",
    }).success).toBe(true);
  });
  it("rejects an empty title", () => {
    expect(createCampaignInputSchema.safeParse({ title: "", body: "x", audienceSpec: { everyone: true } }).success).toBe(false);
  });
});
