import { describe, expect, it } from "vitest";
import { endOfStudioDay } from "@/lib/studio-time";

// Package expiry is a CALENDAR concept for the client ("my pack is good
// through 23 July") but was stored as a raw instant — startsAt + N*24h. A
// client who paid at 08:00 silently lost their final day at 08:00. These
// tests pin the boundary to the studio's own end-of-day, in Belgrade, so
// the last day is whole regardless of purchase time or server timezone.
describe("endOfStudioDay", () => {
  it("returns the last instant of that calendar day in Belgrade (summer, CEST +02)", () => {
    // 23 July 2026 09:00 Belgrade -> 23 July 23:59:59.999 Belgrade,
    // which is 21:59:59.999Z because CEST is UTC+2.
    const result = endOfStudioDay(new Date("2026-07-23T07:00:00.000Z"));
    expect(result.toISOString()).toBe("2026-07-23T21:59:59.999Z");
  });

  it("returns the last instant of that calendar day in Belgrade (winter, CET +01)", () => {
    // DST matters: in January Belgrade is UTC+1, so end-of-day is 22:59:59.999Z.
    // A fixed UTC offset would be an hour wrong for half the year.
    const result = endOfStudioDay(new Date("2026-01-15T09:00:00.000Z"));
    expect(result.toISOString()).toBe("2026-01-15T22:59:59.999Z");
  });

  it("is idempotent - an instant already at end-of-day stays put", () => {
    const once = endOfStudioDay(new Date("2026-07-23T07:00:00.000Z"));
    expect(endOfStudioDay(once).toISOString()).toBe(once.toISOString());
  });

  it("resolves the Belgrade calendar day, not the UTC one, near midnight", () => {
    // 23:30Z on 22 July is already 01:30 on 23 July in Belgrade. The studio
    // day that instant belongs to is the 23rd, so expiry must land on the
    // 23rd's end-of-day - not the 22nd's.
    const result = endOfStudioDay(new Date("2026-07-22T23:30:00.000Z"));
    expect(result.toISOString()).toBe("2026-07-23T21:59:59.999Z");
  });
});
