/**
 * Unit tests for the in-app notification detail-sheet decision.
 *
 * The inbox clamps a notification body to 2 lines. When a user taps a row we
 * want to open a full-text detail sheet ONLY for notifications that are both
 * (a) going nowhere (no navigation destination) AND (b) actually truncated —
 * there's no point popping a sheet for a short, fully-visible message.
 *
 * This is the only piece of real logic in the feature; the rest is wiring.
 */
import { describe, it, expect } from "vitest";
import { shouldOpenDetailSheet } from "@/lib/notification-detail-sheet";

describe("shouldOpenDetailSheet", () => {
  it("opens the sheet when the tap did not navigate and the body is truncated", () => {
    expect(shouldOpenDetailSheet({ navigated: false, bodyTruncated: true })).toBe(true);
  });

  it("does not open the sheet when the tap navigated, even if truncated", () => {
    expect(shouldOpenDetailSheet({ navigated: true, bodyTruncated: true })).toBe(false);
  });

  it("does not open the sheet when the body fits, even with nowhere to navigate", () => {
    expect(shouldOpenDetailSheet({ navigated: false, bodyTruncated: false })).toBe(false);
  });

  it("does not open the sheet when it navigated and the body fits", () => {
    expect(shouldOpenDetailSheet({ navigated: true, bodyTruncated: false })).toBe(false);
  });
});
