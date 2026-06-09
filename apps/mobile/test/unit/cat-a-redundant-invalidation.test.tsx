/**
 * Cat A — mutations that should NOT refetch after they already know the answer.
 *
 * Two cases, same principle as the merged notification-toggle fix (PR #50):
 *   1. useRecordSocialMediaMutation already writes the cache optimistically in
 *      onMutate (+ onError rollback); the onSettled invalidate was a redundant
 *      refetch of a value we already hold. It must be gone.
 *   2. useUpdatePreferencesMutation must do the same — optimistic onMutate write
 *      + onError rollback, and NOT invalidate the preferences query on success.
 *
 * Driven via MutationObserver against a real QueryClient (this repo has no RTL).
 * apiFetch/env are mocked to sever the react-native import chain.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { QueryClient, MutationObserver } from "@tanstack/react-query";

vi.mock("@/lib/env.shared", () => ({
  sharedEnv: { EXPO_PUBLIC_API_URL: "http://test.local" },
}));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

import {
  consentQueries,
  recordSocialMediaMutationOptions,
} from "@/lib/queries/consent-queries-factory";
import {
  notificationsQueries,
  updatePreferencesMutationOptions,
} from "@/lib/queries/notifications-queries-factory";

describe("Cat A — recordSocialMediaMutationOptions does not refetch on success", () => {
  const statusKey = consentQueries.status().queryKey;
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    client.setQueryData(statusKey, {
      success: true,
      pending: [],
      guardianVerificationNeeded: false,
      socialMediaDecided: true,
      socialMediaLatestAccepted: false,
    });
  });

  it("optimistically flips the value and never invalidates the status query", async () => {
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const observer = new MutationObserver(client, {
      ...recordSocialMediaMutationOptions(client),
      mutationFn: async () => ({ success: true }),
    });

    await observer.mutate({ accepted: true });

    const cached = client.getQueryData<{ socialMediaLatestAccepted: boolean | null }>(statusKey);
    expect(cached?.socialMediaLatestAccepted).toBe(true);

    const invalidatedStatus = invalidateSpy.mock.calls.some(([f]) => {
      const k = (f as { queryKey?: readonly unknown[] } | undefined)?.queryKey;
      return k?.[0] === "consent" && k?.[1] === "status";
    });
    expect(invalidatedStatus).toBe(false);
  });

  it("rolls back on failure", async () => {
    const observer = new MutationObserver(client, {
      ...recordSocialMediaMutationOptions(client),
      mutationFn: async () => {
        throw new Error("record failed");
      },
    });

    await observer.mutate({ accepted: true }).catch(() => {});

    const cached = client.getQueryData<{ socialMediaLatestAccepted: boolean | null }>(statusKey);
    expect(cached?.socialMediaLatestAccepted).toBe(false);
  });
});

describe("Cat A — updatePreferencesMutationOptions optimistic, no refetch", () => {
  const prefsKey = notificationsQueries.preferences().queryKey;
  let client: QueryClient;

  function seed() {
    client.setQueryData(prefsKey, {
      success: true,
      preferences: {
        pushEnabled: true,
        inAppEnabled: true,
        campaignsEnabled: true,
        bookingEmailsEnabled: true,
        preferredLocale: null,
      },
    });
  }

  beforeEach(() => {
    client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    seed();
  });

  it("writes the flipped value into the cache and does not invalidate on success", async () => {
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const observer = new MutationObserver(client, {
      ...updatePreferencesMutationOptions(client),
      mutationFn: async () => ({ success: true }),
    });

    await observer.mutate({ campaignsEnabled: false });

    const cached = client.getQueryData<any>(prefsKey);
    expect(cached?.preferences.campaignsEnabled).toBe(false);

    const invalidatedPrefs = invalidateSpy.mock.calls.some(([f]) => {
      const k = (f as { queryKey?: readonly unknown[] } | undefined)?.queryKey;
      return k?.[0] === "notifications" && k?.[1] === "preferences";
    });
    expect(invalidatedPrefs).toBe(false);
  });

  it("rolls back the cache on failure", async () => {
    const observer = new MutationObserver(client, {
      ...updatePreferencesMutationOptions(client),
      mutationFn: async () => {
        throw new Error("patch failed");
      },
    });

    await observer.mutate({ campaignsEnabled: false }).catch(() => {});

    const cached = client.getQueryData<any>(prefsKey);
    expect(cached?.preferences.campaignsEnabled).toBe(true);
  });
});
