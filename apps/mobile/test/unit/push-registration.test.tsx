/**
 * Unit tests for usePushRegistration.
 *
 * The bug these lock down: only 3 PushToken rows existed across 69 users on
 * staging, because sign-out sets `isActive: false` server-side and the client
 * never reliably re-registered afterwards. The effect keyed on
 * `isAuthenticated` alone, so signing in as a DIFFERENT user on the same
 * device (isAuthenticated stays true throughout) never re-fired, and any
 * thrown error vanished into a bare `catch {}`.
 *
 * Driven with react-test-renderer (no RTL in this repo). expo-notifications /
 * expo-constants are dynamically imported by the hook, so they're mocked at
 * the module boundary.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

const registerMutateAsync = vi.fn(async () => ({ success: true }));

vi.mock("@tanstack/react-query", () => ({
  useMutation: () => ({ mutateAsync: registerMutateAsync }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: "sr" } }),
}));

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  Linking: { openSettings: vi.fn() },
}));

vi.mock("@/lib/device-id", () => ({
  getStableDeviceId: vi.fn(async () => "device-uuid-1"),
}));

vi.mock("@/lib/queries/notifications-queries-factory", () => ({
  notificationsQueries: { registerPushToken: () => ({}) },
}));

const captureException = vi.fn();
vi.mock("@sentry/react-native", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

// Permission status the mocked expo-notifications reports. Mutated per test.
let permissionStatus = "granted";
let getTokenImpl = vi.fn(async () => ({ data: "ExpoPushToken[abc]" }));
let pushTokenListener: ((token: { data: string }) => void) | null = null;
const removeListener = vi.fn();

vi.mock("expo-notifications", () => ({
  setNotificationHandler: vi.fn(),
  setNotificationChannelAsync: vi.fn(async () => undefined),
  getPermissionsAsync: vi.fn(async () => ({ status: permissionStatus })),
  requestPermissionsAsync: vi.fn(async () => ({ status: permissionStatus })),
  getExpoPushTokenAsync: (...args: unknown[]) => getTokenImpl(...(args as [])),
  addPushTokenListener: (cb: (token: { data: string }) => void) => {
    pushTokenListener = cb;
    return { remove: removeListener };
  },
  AndroidImportance: { MAX: 5 },
}));

vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { eas: { projectId: "proj-1" } } }, easConfig: null },
}));

import { usePushRegistration } from "@/lib/push-registration";

type Props = { isAuthenticated: boolean; userId?: string | null };

function Probe(props: Props) {
  usePushRegistration(props);
  return null;
}

// Mount the hook and allow the dynamic imports + async effect body to settle.
async function mountHook(initial: Props) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<Probe {...initial} />);
  });
  return {
    rerender: async (next: Props) => {
      await act(async () => {
        renderer.update(<Probe {...next} />);
      });
    },
    unmount: async () => {
      await act(async () => {
        renderer.unmount();
      });
    },
  };
}

describe("usePushRegistration", () => {
  beforeEach(() => {
    permissionStatus = "granted";
    pushTokenListener = null;
    getTokenImpl = vi.fn(async () => ({ data: "ExpoPushToken[abc]" }));
    registerMutateAsync.mockClear();
    captureException.mockClear();
    removeListener.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("registers the token once the user is authenticated", async () => {
    await mountHook({ isAuthenticated: true, userId: "user-1" });

    expect(registerMutateAsync).toHaveBeenCalledTimes(1);
    expect(registerMutateAsync).toHaveBeenCalledWith({
      deviceId: "device-uuid-1",
      expoPushToken: "ExpoPushToken[abc]",
      preferredLocale: "sr",
    });
  });

  it("does not register while signed out", async () => {
    await mountHook({ isAuthenticated: false, userId: null });
    expect(registerMutateAsync).not.toHaveBeenCalled();
  });

  it("re-registers after a sign-out → sign-in cycle", async () => {
    const hook = await mountHook({ isAuthenticated: true, userId: "user-1" });
    expect(registerMutateAsync).toHaveBeenCalledTimes(1);

    // Sign out: the server flips isActive=false on this device's row.
    await hook.rerender({ isAuthenticated: false, userId: null });
    expect(registerMutateAsync).toHaveBeenCalledTimes(1);

    // Sign back in as the same user — the row must be reclaimed (isActive=true).
    await hook.rerender({ isAuthenticated: true, userId: "user-1" });
    expect(registerMutateAsync).toHaveBeenCalledTimes(2);
  });

  it("re-registers when a DIFFERENT user signs in on the same device", async () => {
    // isAuthenticated never goes false here — an account switch keeps the
    // session truthy the whole time, which is exactly what the old
    // isAuthenticated-only dep list missed.
    const hook = await mountHook({ isAuthenticated: true, userId: "user-1" });
    expect(registerMutateAsync).toHaveBeenCalledTimes(1);

    await hook.rerender({ isAuthenticated: true, userId: "user-2" });
    expect(registerMutateAsync).toHaveBeenCalledTimes(2);
  });

  it("does not re-register on an unrelated re-render with the same user", async () => {
    const hook = await mountHook({ isAuthenticated: true, userId: "user-1" });
    await hook.rerender({ isAuthenticated: true, userId: "user-1" });
    expect(registerMutateAsync).toHaveBeenCalledTimes(1);
  });

  it("reports registration failures to Sentry instead of swallowing them", async () => {
    getTokenImpl = vi.fn(async () => {
      throw new Error("no projectId");
    });

    await mountHook({ isAuthenticated: true, userId: "user-1" });

    expect(registerMutateAsync).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledTimes(1);
    const [error, context] = captureException.mock.calls[0] as [
      Error,
      { tags?: Record<string, unknown>; extra?: Record<string, unknown> },
    ];
    expect(error).toBeInstanceOf(Error);
    expect(context).toMatchObject({
      tags: expect.objectContaining({ feature: "push-registration" }),
    });
  });

  it("does not register when the OS permission is denied", async () => {
    permissionStatus = "denied";
    await mountHook({ isAuthenticated: true, userId: "user-1" });
    expect(registerMutateAsync).not.toHaveBeenCalled();
  });

  it("reports token-rotation failures rather than ignoring them", async () => {
    await mountHook({ isAuthenticated: true, userId: "user-1" });
    expect(pushTokenListener).not.toBeNull();

    registerMutateAsync.mockRejectedValueOnce(new Error("rotation failed"));
    await act(async () => {
      pushTokenListener?.({ data: "ExpoPushToken[rotated]" });
    });

    expect(captureException).toHaveBeenCalled();
  });
});
