import { describe, expect, it } from "vitest";
import {
  bookableSessions,
  canHoldAnotherBooking,
  isLastBookableSlot,
} from "@/lib/server/package-hold";

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

describe("isLastBookableSlot", () => {
  it("is true when exactly one bookable slot is left after current holds", () => {
    expect(isLastBookableSlot({ sessionsRemaining: 12, heldCount: 11 })).toBe(true);
    expect(isLastBookableSlot({ sessionsRemaining: 1, heldCount: 0 })).toBe(true);
  });

  it("is false while more than one slot remains", () => {
    expect(isLastBookableSlot({ sessionsRemaining: 12, heldCount: 0 })).toBe(false);
    expect(isLastBookableSlot({ sessionsRemaining: 3, heldCount: 1 })).toBe(false);
  });

  it("is false when the package is already fully held or exhausted", () => {
    expect(isLastBookableSlot({ sessionsRemaining: 12, heldCount: 12 })).toBe(false);
    expect(isLastBookableSlot({ sessionsRemaining: 0, heldCount: 0 })).toBe(false);
    expect(isLastBookableSlot({ sessionsRemaining: 0, heldCount: 1 })).toBe(false);
  });
});

describe("bookableSessions", () => {
  it("is sessionsRemaining minus held sessions", () => {
    expect(bookableSessions({ sessionsRemaining: 12, heldCount: 0 })).toBe(12);
    expect(bookableSessions({ sessionsRemaining: 12, heldCount: 3 })).toBe(9);
    expect(bookableSessions({ sessionsRemaining: 8, heldCount: 8 })).toBe(0);
  });

  it("clamps at zero when holds exceed remaining (e.g. admin over-reservation)", () => {
    expect(bookableSessions({ sessionsRemaining: 2, heldCount: 5 })).toBe(0);
  });

  it("agrees with the booking gate: bookable > 0 exactly when another booking may be held", () => {
    for (const sessionsRemaining of [0, 1, 8, 12]) {
      for (const heldCount of [0, 1, 8, 12, 13]) {
        expect(bookableSessions({ sessionsRemaining, heldCount }) > 0).toBe(
          canHoldAnotherBooking({ sessionsRemaining, heldCount }),
        );
      }
    }
  });
});
