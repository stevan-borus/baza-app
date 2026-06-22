import { describe, it, expect } from "vitest";
import { decideUpdatePrompt } from "@/lib/app-updates/decide-update-prompt";

/**
 * The pure heart of the app-update feature: given the OTA state and the
 * installed-vs-required native versions, decide which (if any) prompt to show.
 *
 * Precedence (highest first):
 *   1. store-required — installed binary is below the server's minVersion
 *   2. ota           — a new JS bundle is fetched and ready to apply
 *   3. store-soft     — a newer binary exists but the current one is allowed
 *   4. none
 */
describe("decideUpdatePrompt", () => {
  const base = {
    otaReady: false,
    currentVersion: "1.0.0",
    minVersion: "1.0.0",
    latestVersion: "1.0.0",
  };

  it("returns 'none' when up to date and no OTA pending", () => {
    expect(decideUpdatePrompt(base)).toBe("none");
  });

  it("returns 'ota' when a bundle is ready and versions are fine", () => {
    expect(decideUpdatePrompt({ ...base, otaReady: true })).toBe("ota");
  });

  it("returns 'store-soft' when a newer binary exists but current is allowed", () => {
    expect(
      decideUpdatePrompt({ ...base, currentVersion: "1.0.0", latestVersion: "1.1.0" }),
    ).toBe("store-soft");
  });

  it("returns 'store-required' when current is below minVersion", () => {
    expect(
      decideUpdatePrompt({
        ...base,
        currentVersion: "1.0.0",
        minVersion: "1.1.0",
        latestVersion: "1.1.0",
      }),
    ).toBe("store-required");
  });

  it("prioritises 'store-required' over a pending OTA", () => {
    expect(
      decideUpdatePrompt({
        otaReady: true,
        currentVersion: "1.0.0",
        minVersion: "1.1.0",
        latestVersion: "1.1.0",
      }),
    ).toBe("store-required");
  });

  it("prioritises 'ota' over a soft store nudge", () => {
    expect(
      decideUpdatePrompt({
        otaReady: true,
        currentVersion: "1.0.0",
        minVersion: "1.0.0",
        latestVersion: "1.1.0",
      }),
    ).toBe("ota");
  });

  it("treats currentVersion === minVersion as allowed (boundary)", () => {
    expect(
      decideUpdatePrompt({
        ...base,
        currentVersion: "1.1.0",
        minVersion: "1.1.0",
        latestVersion: "1.1.0",
      }),
    ).toBe("none");
  });

  it("treats currentVersion === latestVersion as up to date (boundary)", () => {
    expect(
      decideUpdatePrompt({
        ...base,
        currentVersion: "2.0.0",
        latestVersion: "2.0.0",
      }),
    ).toBe("none");
  });

  it("does not nudge when current is ahead of latest (e.g. internal build)", () => {
    expect(
      decideUpdatePrompt({
        ...base,
        currentVersion: "1.2.0",
        latestVersion: "1.1.0",
        minVersion: "1.0.0",
      }),
    ).toBe("none");
  });

  it("compares semver numerically, not lexicographically (1.10.0 > 1.9.0)", () => {
    expect(
      decideUpdatePrompt({
        ...base,
        currentVersion: "1.9.0",
        latestVersion: "1.10.0",
        minVersion: "1.0.0",
      }),
    ).toBe("store-soft");

    expect(
      decideUpdatePrompt({
        ...base,
        currentVersion: "1.9.0",
        minVersion: "1.10.0",
        latestVersion: "1.10.0",
      }),
    ).toBe("store-required");
  });

  it("ignores a build-number suffix on the current version (1.0.0(42))", () => {
    expect(
      decideUpdatePrompt({
        ...base,
        currentVersion: "1.0.0 (42)",
        minVersion: "1.0.0",
        latestVersion: "1.0.0",
      }),
    ).toBe("none");
  });

  it("falls back to 'none' (never blocks) when a version string is unparseable", () => {
    expect(
      decideUpdatePrompt({
        otaReady: false,
        currentVersion: "garbage",
        minVersion: "1.1.0",
        latestVersion: "1.1.0",
      }),
    ).toBe("none");
  });

  it("still surfaces a ready OTA even when versions are unparseable", () => {
    expect(
      decideUpdatePrompt({
        otaReady: true,
        currentVersion: "garbage",
        minVersion: "1.1.0",
        latestVersion: "1.1.0",
      }),
    ).toBe("ota");
  });
});
