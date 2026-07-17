import { describe, expect, it } from "vitest";
import { mapResultStateToSuccessState } from "@/lib/booking-success-state";

/**
 * The booking sheet's success confirmation is driven by the server's mutation
 * `state`. The sheet only understands three visible outcomes — BOOKED,
 * WAITLISTED, CANCELED — so every server state must map onto one of those (or
 * null for "no confirmation"). The regression this guards: a client's own
 * cancel that also promotes a waitlisted peer comes back as WAITLIST_PROMOTED,
 * which used to fall through to null — the canceling client saw no confirmation
 * at all, as if the cancel had been silently swallowed.
 */
describe("mapResultStateToSuccessState", () => {
  it("maps BOOKED to the BOOKED confirmation", () => {
    expect(mapResultStateToSuccessState("BOOKED")).toBe("BOOKED");
  });

  it("maps BOOKED_ALREADY to the BOOKED confirmation", () => {
    expect(mapResultStateToSuccessState("BOOKED_ALREADY")).toBe("BOOKED");
  });

  it("maps WAITLISTED to the WAITLISTED confirmation", () => {
    expect(mapResultStateToSuccessState("WAITLISTED")).toBe("WAITLISTED");
  });

  it("maps CANCELED to the CANCELED confirmation", () => {
    expect(mapResultStateToSuccessState("CANCELED")).toBe("CANCELED");
  });

  it("maps WAITLIST_PROMOTED to the CANCELED confirmation — from the canceling client's perspective it is a successful cancel", () => {
    expect(mapResultStateToSuccessState("WAITLIST_PROMOTED")).toBe("CANCELED");
  });

  it("maps LEFT_WAITLIST to the LEFT_WAITLIST confirmation", () => {
    expect(mapResultStateToSuccessState("LEFT_WAITLIST")).toBe("LEFT_WAITLIST");
  });

  it("maps unknown / undefined state to null (no confirmation)", () => {
    expect(mapResultStateToSuccessState(undefined)).toBeNull();
    expect(mapResultStateToSuccessState("SOMETHING_ELSE")).toBeNull();
  });
});
