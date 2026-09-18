/**
 * Unit tests for usePushReceivedListener.
 *
 * A push landing while the app is open used to change nothing on screen: the
 * inbox query stayed fresh in cache, so the newest notification was missing
 * until the app was killed and reopened. The listener invalidates the whole
 * `notifications` key so the inbox and the unread badge both refetch.
 *
 * Driven with react-test-renderer against a REAL QueryClient — the assertion
 * is the observable cache state (`isInvalidated`), never a spy on
 * `invalidateQueries`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

let receivedListener: ((notification: unknown) => void) | null = null;
const removeListener = vi.fn();

// The queries factory reaches expo-modules-core through the transport seam,
// which the node-env unit project can't load. Only the query KEY matters here.
vi.mock("@/lib/api-request", () => ({
  apiRequest: vi.fn(async () => ({ success: true })),
}));

vi.mock("expo-notifications", () => ({
  addNotificationReceivedListener: (cb: (notification: unknown) => void) => {
    receivedListener = cb;
    return { remove: removeListener };
  },
}));

import { usePushReceivedListener } from "@/lib/push-received-listener";
import { notificationsQueries } from "@/lib/queries/notifications-queries-factory";

function Probe({ isAuthenticated }: { isAuthenticated: boolean }) {
  usePushReceivedListener({ isAuthenticated });
  return null;
}

async function mountHook(isAuthenticated: boolean) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const listKey = notificationsQueries.listInfinite().queryKey;
  queryClient.setQueryData(listKey, {
    pages: [{ success: true, notifications: [], nextCursor: null }],
    pageParams: [null],
  });

  await act(async () => {
    TestRenderer.create(
      <QueryClientProvider client={queryClient}>
        <Probe isAuthenticated={isAuthenticated} />
      </QueryClientProvider>,
    );
  });

  return {
    queryClient,
    isListInvalidated: () =>
      queryClient.getQueryState(listKey)?.isInvalidated ?? false,
  };
}

describe("usePushReceivedListener", () => {
  beforeEach(() => {
    receivedListener = null;
    removeListener.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("invalidates the notifications cache when a push arrives", async () => {
    const hook = await mountHook(true);
    expect(hook.isListInvalidated()).toBe(false);

    await act(async () => {
      receivedListener?.({ request: { identifier: "push-1" } });
    });

    expect(hook.isListInvalidated()).toBe(true);
  });

  it("does not subscribe while signed out", async () => {
    await mountHook(false);
    expect(receivedListener).toBeNull();
  });
});
