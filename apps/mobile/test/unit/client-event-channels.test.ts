import { describe, expect, it } from "vitest";
import { CLIENT_EVENT_CHANNELS } from "@/lib/server/client-event-channels";

describe("CLIENT_EVENT_CHANNELS registry", () => {
  it("WAITLIST_PROMOTED fans to both in-app and email", () => {
    const ch = CLIENT_EVENT_CHANNELS.WAITLIST_PROMOTED;
    expect(ch.email).toBe("WAITLIST_PROMOTED");
    expect(ch.inApp).toEqual({
      messageKey: "SPOT_OPENED_FROM_WAITLIST",
      type: "BOOKING_CONFIRMED",
    });
  });

  it("SESSION_UPDATED fans to both in-app and email", () => {
    const ch = CLIENT_EVENT_CHANNELS.SESSION_UPDATED;
    expect(ch.email).toBe("SESSION_UPDATED");
    expect(ch.inApp).toEqual({
      messageKey: "SESSION_UPDATED",
      type: "SESSION_UPDATED",
    });
  });

  it("ADMIN_CANCEL is email-only (the client's in-app cancel record is written elsewhere)", () => {
    const ch = CLIENT_EVENT_CHANNELS.ADMIN_CANCEL;
    expect(ch.email).toBe("ADMIN_CANCEL");
    expect(ch.inApp).toBeUndefined();
  });

  it("BULK_CANCEL is email-only", () => {
    const ch = CLIENT_EVENT_CHANNELS.BULK_CANCEL;
    expect(ch.email).toBe("BULK_CANCEL");
    expect(ch.inApp).toBeUndefined();
  });

  it("every event declares at least one channel (no silent no-op event)", () => {
    for (const [event, ch] of Object.entries(CLIENT_EVENT_CHANNELS)) {
      expect(
        ch.email !== undefined || ch.inApp !== undefined,
        `event ${event} must declare at least one channel`,
      ).toBe(true);
    }
  });
});
