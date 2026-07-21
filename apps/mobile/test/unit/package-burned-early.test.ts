import { describe, expect, it } from "vitest";
import { computePackageExpiresAt } from "@/lib/package-expiry";
import {
  classifyRenewalLockReason,
  findEligibleClientPackage,
} from "@/lib/server/package-eligibility";
import { studioDayStartFor } from "@/lib/studio-time";
import { suggestedPackageStart } from "@/lib/suggested-package-start";

const REFORMER = "11111111-1111-1111-1111-111111111111";

// The "burned through it early" case, end to end: a client takes all 12
// sessions of a 30-day pack in 20 days, then buys a new one on day 21.
//
// Sessions and days are INDEPENDENT kill switches — whichever runs out
// first ends the package. The leftover validity of a spent pack must never
// delay the replacement.
describe("a package burned through before its days run out", () => {
  const startsAt = studioDayStartFor(new Date("2026-07-01T12:00:00.000Z"));
  const expiresAt = computePackageExpiresAt(startsAt, 30); // through 30 July
  const dayTwentyOne = new Date("2026-07-21T10:00:00.000Z");

  const spent = {
    id: "pkg-spent",
    classTypeIds: [REFORMER],
    startsAt,
    expiresAt,
    sessionsRemaining: 0,
    revokedAt: null,
  };

  it("stops being bookable the moment sessions hit zero, with days still left", () => {
    // 9 days of validity remain, but the pack is spent — it must not back
    // a booking.
    expect(expiresAt.getTime()).toBeGreaterThan(dayTwentyOne.getTime());
    expect(
      findEligibleClientPackage([spent], [], dayTwentyOne, REFORMER),
    ).toBeNull();
  });

  it("tells the client to RENEW rather than blaming a pause or a start date", () => {
    expect(
      classifyRenewalLockReason([spent], [], dayTwentyOne, REFORMER),
    ).toBe("RENEW");
  });

  it("suggests starting the replacement TODAY, not after the spent pack's expiry", () => {
    // The admin sells a new pack on day 21. Queueing it behind the old
    // pack's unused validity would lock the client out until 31 July for
    // no reason — they have no sessions and are standing at the desk.
    const suggestion = suggestedPackageStart(
      [{ expiresAt: expiresAt.toISOString(), sessionsRemaining: 0 }],
      dayTwentyOne,
    );
    expect(suggestion.toISOString()).toBe(
      studioDayStartFor(dayTwentyOne).toISOString(),
    );
  });

  it("lets the client book again from the morning the new package starts", () => {
    const fresh = {
      id: "pkg-fresh",
      classTypeIds: [REFORMER],
      startsAt: studioDayStartFor(dayTwentyOne),
      expiresAt: computePackageExpiresAt(studioDayStartFor(dayTwentyOne), 30),
      sessionsRemaining: 12,
      revokedAt: null,
    };
    // 06:30 on day 21 — the first class of the day the pack starts. The
    // 05:00 opening exists precisely so this books.
    const firstClass = new Date("2026-07-21T04:30:00.000Z");
    expect(
      findEligibleClientPackage([spent, fresh], [], firstClass, REFORMER)?.id,
    ).toBe("pkg-fresh");
  });

  it("spends the fresh pack, never the spent one, while both are on file", () => {
    // The spent pack is still date-valid and still owned; it must simply
    // never win the spend priority.
    const fresh = {
      id: "pkg-fresh",
      classTypeIds: [REFORMER],
      startsAt: studioDayStartFor(dayTwentyOne),
      expiresAt: computePackageExpiresAt(studioDayStartFor(dayTwentyOne), 30),
      sessionsRemaining: 12,
      revokedAt: null,
    };
    const at = new Date("2026-07-25T10:00:00.000Z");
    expect(findEligibleClientPackage([spent, fresh], [], at, REFORMER)?.id).toBe(
      "pkg-fresh",
    );
  });
});
