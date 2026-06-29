import { describe, expect, it } from "vitest";
import { canHoldAnotherBooking } from "@/lib/server/package-hold";

describe("canHoldAnotherBooking", () => {
  it("allows a booking when fewer sessions are held than remain", () => {
    expect(canHoldAnotherBooking({ sessionsRemaining: 12, heldCount: 0 })).toBe(true);
    expect(canHoldAnotherBooking({ sessionsRemaining: 12, heldCount: 11 })).toBe(true);
  });

  it("rejects the booking that would exceed remaining sessions", () => {
    expect(canHoldAnotherBooking({ sessionsRemaining: 12, heldCount: 12 })).toBe(false);
    expect(canHoldAnotherBooking({ sessionsRemaining: 12, heldCount: 13 })).toBe(false);
  });

  it("rejects when nothing remains", () => {
    expect(canHoldAnotherBooking({ sessionsRemaining: 0, heldCount: 0 })).toBe(false);
  });
});
