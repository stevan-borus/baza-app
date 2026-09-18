/**
 * The one-time marketing opt-in prompt's visibility rule.
 *
 * Serbian law requires marketing opt-IN, so `campaignsEnabled` defaults to
 * false and nobody is ever asked. The prompt asks once: only while the
 * preference is still off, and never again after the client answers or
 * dismisses it.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  markCampaignsOptInSeen,
  shouldShowCampaignsOptIn,
  type OptInStorage,
} from "@/lib/campaigns-opt-in-prompt";

function memoryStorage(): OptInStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: async (key) => map.get(key) ?? null,
    setItem: async (key, value) => {
      map.set(key, value);
    },
  };
}

describe("shouldShowCampaignsOptIn", () => {
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    storage = memoryStorage();
  });

  it("shows when the preference is off and the flag is unset", async () => {
    await expect(
      shouldShowCampaignsOptIn({
        userId: "user-1",
        campaignsEnabled: false,
        storage,
      }),
    ).resolves.toBe(true);
  });

  it("stays hidden when the client already has campaigns on", async () => {
    await expect(
      shouldShowCampaignsOptIn({
        userId: "user-1",
        campaignsEnabled: true,
        storage,
      }),
    ).resolves.toBe(false);
  });

  it("stays hidden once the prompt has been marked seen", async () => {
    await markCampaignsOptInSeen("user-1", storage);

    await expect(
      shouldShowCampaignsOptIn({
        userId: "user-1",
        campaignsEnabled: false,
        storage,
      }),
    ).resolves.toBe(false);
  });

  it("keys the seen flag per user — a second account still gets asked", async () => {
    await markCampaignsOptInSeen("user-1", storage);

    await expect(
      shouldShowCampaignsOptIn({
        userId: "user-2",
        campaignsEnabled: false,
        storage,
      }),
    ).resolves.toBe(true);
  });

  it("writes the flag under a user-scoped key", async () => {
    await markCampaignsOptInSeen("user-1", storage);
    expect(storage.map.has("campaigns-opt-in-prompted:user-1")).toBe(true);
  });

  it("stays hidden while the user id or preference is still unknown", async () => {
    await expect(
      shouldShowCampaignsOptIn({
        userId: undefined,
        campaignsEnabled: false,
        storage,
      }),
    ).resolves.toBe(false);
    await expect(
      shouldShowCampaignsOptIn({
        userId: "user-1",
        campaignsEnabled: undefined,
        storage,
      }),
    ).resolves.toBe(false);
  });

  it("does not show if the storage read fails", async () => {
    const broken: OptInStorage = {
      getItem: async () => {
        throw new Error("storage unavailable");
      },
      setItem: async () => {},
    };

    await expect(
      shouldShowCampaignsOptIn({
        userId: "user-1",
        campaignsEnabled: false,
        storage: broken,
      }),
    ).resolves.toBe(false);
  });
});
