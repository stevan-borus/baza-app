import { describe, expect, it } from "vitest";
import { isActiveClientPackage } from "@/lib/package-fully-booked";
import { packageDaysLeft } from "@/lib/package-expiry";

// The card shows a date AND a countdown; they must agree. dayjs
// .diff(-, "day") truncates toward zero, so a pack expiring 23 July read
// "1 more day" on 21 July - two visible calendar days, one claimed. The
// countdown is a CALENDAR-day distance, matching how the client reads the
// date next to it.
describe("packageDaysLeft", () => {
  it("counts calendar days between today and the expiry day", () => {
    // 21 July -> expires end of 23 July. The client has today, the 22nd
    // and the 23rd: 2 days AFTER today, which is what the copy means by
    // "still X days".
    const days = packageDaysLeft(
      new Date("2026-07-23T21:59:59.999Z"),
      new Date("2026-07-21T13:00:00.000Z"),
    );
    expect(days).toBe(2);
  });

  it("ignores time of day - only the calendar date matters", () => {
    // The old truncating diff gave different answers at 09:00 and 23:00
    // on the same day. Same day in, same number out.
    const expiresAt = new Date("2026-07-23T21:59:59.999Z");
    const morning = packageDaysLeft(
      expiresAt,
      new Date("2026-07-21T05:00:00.000Z"),
    );
    const evening = packageDaysLeft(
      expiresAt,
      new Date("2026-07-21T20:00:00.000Z"),
    );
    expect(morning).toBe(evening);
  });

  it("returns 0 on the expiry day itself - still usable, but last chance", () => {
    const days = packageDaysLeft(
      new Date("2026-07-23T21:59:59.999Z"),
      new Date("2026-07-23T08:00:00.000Z"),
    );
    expect(days).toBe(0);
  });

  it("returns a negative count once the pack has lapsed", () => {
    const days = packageDaysLeft(
      new Date("2026-07-23T21:59:59.999Z"),
      new Date("2026-07-25T08:00:00.000Z"),
    );
    expect(days).toBe(-2);
  });

  it("is never negative for a package the home card would actually render", () => {
    // The countdown copy has no negative branch, and it doesn't need one:
    // the card only renders packages that pass isActiveClientPackage, which
    // requires expiresAt > now. This pins the two rules together so a future
    // change to the active-package gate can't start feeding "-3 days left"
    // into the UI without failing here.
    const expiresAt = "2026-07-23T21:59:59.999Z";
    const lapsed = new Date("2026-07-24T08:00:00.000Z");
    expect(
      isActiveClientPackage({ sessionsRemaining: 5, expiresAt }, lapsed),
    ).toBe(false);

    const stillLive = new Date("2026-07-23T20:00:00.000Z");
    expect(
      isActiveClientPackage({ sessionsRemaining: 5, expiresAt }, stillLive),
    ).toBe(true);
    expect(packageDaysLeft(new Date(expiresAt), stillLive)).toBeGreaterThanOrEqual(0);
  });

  it("uses the studio calendar day, not the viewer's device timezone", () => {
    // 22:30Z on 21 July is already 00:30 on the 22nd in Belgrade, so from
    // the studio's point of view only the 22nd and 23rd remain.
    const days = packageDaysLeft(
      new Date("2026-07-23T21:59:59.999Z"),
      new Date("2026-07-21T22:30:00.000Z"),
    );
    expect(days).toBe(1);
  });
});
