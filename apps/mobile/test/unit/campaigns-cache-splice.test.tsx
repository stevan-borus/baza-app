/**
 * Cat B (campaigns) — mutations splice the returned campaign into the list +
 * detail cache instead of invalidating (refetching). The API returns the full
 * campaign (CAMPAIGN_SELECT) for create/update/cancel/send, and delete only
 * needs the id, so no refetch is warranted.
 *
 * Driven via MutationObserver against a real QueryClient (no RTL in this repo).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { QueryClient, MutationObserver } from "@tanstack/react-query";

vi.mock("@/lib/env.shared", () => ({
  sharedEnv: { EXPO_PUBLIC_API_URL: "http://test.local" },
}));
vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

import {
  campaignsQueries,
  createCampaignMutationOptions,
  updateCampaignMutationOptions,
  cancelCampaignMutationOptions,
  sendCampaignMutationOptions,
  removeCampaignMutationOptions,
  type Campaign,
} from "@/lib/queries/campaigns-queries-factory";

const listKey = campaignsQueries.list().queryKey;
const oneKey = (id: string) => campaignsQueries.one(id).queryKey;

function campaign(id: string, over: Partial<Campaign> = {}): Campaign {
  return {
    id,
    title: `C${id}`,
    body: "b",
    audienceSpec: { everyone: true },
    recipientCount: 0,
    status: "DRAFT",
    scheduledFor: null,
    sentAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

let client: QueryClient;
let invalidateSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  invalidateSpy = vi.spyOn(client, "invalidateQueries");
});

// The splice contract: list + detail are written via setQueryData, never
// refetched. The per-campaign recipients cache is the exception — it's
// status/spec-derived on the server, so every campaign write invalidates it.
function noCampaignInvalidation() {
  return invalidateSpy.mock.calls.every((args: unknown[]) => {
    const k = (args[0] as { queryKey?: readonly unknown[] } | undefined)?.queryKey;
    return k?.[0] !== "campaigns" || k?.[1] === "recipients";
  });
}

describe("campaigns cache splice — create", () => {
  it("prepends the new campaign to the list and sets detail, without invalidating", async () => {
    client.setQueryData(listKey, { campaigns: [campaign("1")] });
    const created = campaign("2", { title: "New" });

    const observer = new MutationObserver(client, {
      ...createCampaignMutationOptions(client),
      mutationFn: async () => ({ campaign: created }),
    });
    await observer.mutate({ title: "New", body: "b", audienceSpec: { everyone: true } });

    const list = client.getQueryData<{ campaigns: any[] }>(listKey);
    expect(list?.campaigns.map((c) => c.id)).toEqual(["2", "1"]);
    expect(client.getQueryData(oneKey("2"))).toEqual({ campaign: created });
    expect(noCampaignInvalidation()).toBe(true);
  });
});

describe("campaigns cache splice — update/cancel/send", () => {
  it("update replaces the campaign by id in the list and detail", async () => {
    client.setQueryData(listKey, { campaigns: [campaign("1"), campaign("2")] });
    const updated = campaign("1", { title: "Edited" });

    const observer = new MutationObserver(client, {
      ...updateCampaignMutationOptions(client),
      mutationFn: async () => ({ campaign: updated }),
    });
    await observer.mutate({ id: "1", title: "Edited" });

    const list = client.getQueryData<{ campaigns: any[] }>(listKey);
    expect(list?.campaigns.find((c) => c.id === "1")?.title).toBe("Edited");
    expect(client.getQueryData(oneKey("1"))).toEqual({ campaign: updated });
    expect(noCampaignInvalidation()).toBe(true);
  });

  it("send replaces status via the returned campaign", async () => {
    client.setQueryData(listKey, { campaigns: [campaign("1", { status: "DRAFT" })] });
    const sent = campaign("1", { status: "SENT" });

    const observer = new MutationObserver(client, {
      ...sendCampaignMutationOptions(client),
      mutationFn: async () => ({ campaign: sent }),
    });
    await observer.mutate("1");

    const list = client.getQueryData<{ campaigns: any[] }>(listKey);
    expect(list?.campaigns[0].status).toBe("SENT");
    expect(noCampaignInvalidation()).toBe(true);
  });

  it("cancel reverts status to DRAFT via the returned campaign", async () => {
    client.setQueryData(listKey, { campaigns: [campaign("1", { status: "SCHEDULED" })] });
    const draft = campaign("1", { status: "DRAFT" });

    const observer = new MutationObserver(client, {
      ...cancelCampaignMutationOptions(client),
      mutationFn: async () => ({ campaign: draft }),
    });
    await observer.mutate("1");

    expect(client.getQueryData<{ campaigns: any[] }>(listKey)?.campaigns[0].status).toBe("DRAFT");
    expect(noCampaignInvalidation()).toBe(true);
  });
});

describe("campaigns cache splice — remove", () => {
  it("removes the campaign from the list by id without invalidating", async () => {
    client.setQueryData(listKey, { campaigns: [campaign("1"), campaign("2")] });

    const observer = new MutationObserver(client, {
      ...removeCampaignMutationOptions(client),
      mutationFn: async () => ({ success: true }),
    });
    await observer.mutate("1");

    const list = client.getQueryData<{ campaigns: any[] }>(listKey);
    expect(list?.campaigns.map((c) => c.id)).toEqual(["2"]);
    expect(noCampaignInvalidation()).toBe(true);
  });
});
