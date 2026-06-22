import { describe, it, expect } from "vitest";
import { devForcedPrompt } from "@/lib/app-updates/dev-forced-prompt";

/**
 * Dev-only preview override. EXPO_PUBLIC_FORCE_UPDATE_PROMPT lets us see each
 * real popup in the simulator (where expo-updates is otherwise disabled). The
 * hook applies this ONLY under __DEV__; this helper just validates the string.
 */
describe("devForcedPrompt", () => {
  it("maps 'ota' to the ota prompt", () => {
    expect(devForcedPrompt("ota")).toBe("ota");
  });

  it("maps 'store-soft' to the soft store nudge", () => {
    expect(devForcedPrompt("store-soft")).toBe("store-soft");
  });

  it("maps 'store-required' to the blocking prompt", () => {
    expect(devForcedPrompt("store-required")).toBe("store-required");
  });

  it("trims surrounding whitespace", () => {
    expect(devForcedPrompt("  ota  ")).toBe("ota");
  });

  it("returns null for 'none' (no override)", () => {
    expect(devForcedPrompt("none")).toBeNull();
  });

  it("returns null for an unset value", () => {
    expect(devForcedPrompt(undefined)).toBeNull();
  });

  it("returns null for an unrecognised value", () => {
    expect(devForcedPrompt("banana")).toBeNull();
  });
});
