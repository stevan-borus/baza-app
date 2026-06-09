/**
 * Regression test for the notification-toggle "jitter" bug.
 *
 * Symptom (client report): tapping a notification toggle on the profile
 * settings screen makes the switch flip to the new position, snap back to the
 * old one, then settle on the new one again — a visible left-right-correct
 * jitter on a single tap.
 *
 * Root cause: the update-preferences mutation had no onMutate, so the
 * preferences query cache stayed on the OLD value from the moment the PATCH
 * settled until the onSuccess invalidation's refetch returned. The settings
 * screen's optimistic read only covers `isPending`; once the mutation settles
 * (isPending → false) but before the refetch lands, the switch reads the stale
 * cache and snaps back.
 *
 * Contract under test (the optimistic mutation options): onMutate writes the
 * flipped value into the cache immediately and onError rolls it back — so the
 * cache holds the new value continuously through the settle→refetch window,
 * with no stale-value instant.
 *
 * Driven via @tanstack/react-query's MutationObserver against a real
 * QueryClient — no React renderer needed (this repo has no RTL).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { QueryClient, MutationObserver } from "@tanstack/react-query";

// Sever the react-native import chain (lib/api → react-native) and give the
// factory a deterministic API_URL. The MutationObserver below stubs mutationFn,
// so apiFetch is never actually called — these mocks just keep the module graph
// node-parseable.
vi.mock("@/lib/env.shared", () => ({
  sharedEnv: { EXPO_PUBLIC_API_URL: "http://test.local" },
}));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

import {
  notificationsQueries,
  updatePreferencesMutationOptions,
} from "@/lib/queries/notifications-queries-factory";

const PREFS_KEY = ["notifications", "preferences"] as const;

function initialPrefs() {
  return {
    success: true as const,
    preferences: {
      pushEnabled: true,
      inAppEnabled: true,
      campaignsEnabled: true,
      bookingEmailsEnabled: true,
      preferredLocale: null as string | null,
    },
  };
}

let client: QueryClient;

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(notificationsQueries.preferences().queryKey, initialPrefs());
});

/**
 * Run a mutation through a MutationObserver with a stubbed mutationFn, so we
 * exercise the real onMutate / onError / onSettled without hitting the network.
 * `mutationFnResult` decides success (resolve) vs failure (reject).
 */
function runMutation(
  variables: Record<string, boolean>,
  mode: "success" | "failure",
) {
  const options = updatePreferencesMutationOptions(client);
  const observer = new MutationObserver(client, {
    ...options,
    // Replace the network call; keep the real optimistic lifecycle hooks.
    mutationFn: async () => {
      if (mode === "failure") throw new Error("PATCH failed (500)");
      return { success: true };
    },
  });
  return observer.mutate(variables);
}

describe("updatePreferencesMutationOptions — optimistic cache (no jitter)", () => {
  it("writes the flipped value into the cache on mutate, before the network settles", async () => {
    const options = updatePreferencesMutationOptions(client);
    const observer = new MutationObserver(client, {
      ...options,
      mutationFn: () => new Promise<{ success: true }>(() => {}), // never resolves
    });

    observer.mutate({ campaignsEnabled: false });

    // onMutate awaits cancelQueries before writing, so let the microtask queue
    // drain until the optimistic write lands (cap the spins to avoid hanging if
    // it never does).
    for (let i = 0; i < 50; i++) {
      const v = client.getQueryData<ReturnType<typeof initialPrefs>>(PREFS_KEY)
        ?.preferences.campaignsEnabled;
      if (v === false) break;
      await Promise.resolve();
    }

    const cached = client.getQueryData<ReturnType<typeof initialPrefs>>(PREFS_KEY);
    expect(cached?.preferences.campaignsEnabled).toBe(false);
  });

  it("never exposes the stale value at any point during the mutation lifecycle", async () => {
    const seen: boolean[] = [];
    const unsub = client.getQueryCache().subscribe((event) => {
      if (
        event.query.queryKey[0] === "notifications" &&
        event.query.queryKey[1] === "preferences"
      ) {
        const data = event.query.state.data as ReturnType<typeof initialPrefs> | undefined;
        if (data) seen.push(data.preferences.campaignsEnabled);
      }
    });

    await runMutation({ campaignsEnabled: false }, "success");
    unsub();

    const firstFalse = seen.indexOf(false);
    expect(firstFalse).toBeGreaterThanOrEqual(0); // flipped to false
    expect(seen.slice(firstFalse)).not.toContain(true); // and never reverted
  });

  it("rolls the cache back to the original value if the PATCH fails", async () => {
    await runMutation({ campaignsEnabled: false }, "failure").catch(() => {});

    const cached = client.getQueryData<ReturnType<typeof initialPrefs>>(PREFS_KEY);
    expect(cached?.preferences.campaignsEnabled).toBe(true);
  });
});
