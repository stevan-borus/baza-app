import { describe, expect, it } from "vitest";
import { computePackageExpiresAt } from "@/lib/package-expiry";
import {
  classifyRenewalLockReason,
  clientOwnsPackageForClass,
  findEligibleClientPackage,
} from "@/lib/server/package-eligibility";

const REFORMER_CLASS_TYPE_ID = "11111111-1111-1111-1111-111111111111";
const ENERGY_CLASS_TYPE_ID = "22222222-2222-2222-2222-222222222222";

const baseAt = new Date("2026-05-15T10:00:00Z");

function makePackage(overrides: Partial<{
  id: string;
  classTypeIds: string[];
  startsAt: Date;
  expiresAt: Date;
  sessionsRemaining: number;
  revokedAt: Date | null;
}>) {
  return {
    id: overrides.id ?? "pkg-1",
    classTypeIds: overrides.classTypeIds ?? [REFORMER_CLASS_TYPE_ID],
    startsAt: overrides.startsAt ?? new Date("2026-05-01T00:00:00Z"),
    expiresAt: overrides.expiresAt ?? new Date("2026-06-01T00:00:00Z"),
    sessionsRemaining: overrides.sessionsRemaining ?? 5,
    revokedAt: overrides.revokedAt ?? null,
  };
}

// The whole point of end-of-day expiry: the last day is a WHOLE day. A
// client whose pack expires "23 July" must be able to book a 22:00 class
// on the 23rd. Under the old startsAt + N*24h expiry they were cut off at
// whatever o'clock they originally paid.
describe("findEligibleClientPackage on the final valid day", () => {
  const lastDayEnd = computePackageExpiresAt(
    new Date("2026-06-23T07:00:00.000Z"),
    30,
  );

  it("still books late in the evening of the expiry day", () => {
    // 21:00 Belgrade on 22 July (day 30) — well past the 09:00 purchase
    // o'clock that used to cut the day short, still inside the last day.
    const pkg = makePackage({ expiresAt: lastDayEnd });
    const at = new Date("2026-07-22T19:00:00.000Z");
    expect(
      findEligibleClientPackage([pkg], [], at, REFORMER_CLASS_TYPE_ID)?.id,
    ).toBe("pkg-1");
  });

  it("covers the whole final day regardless of purchase time of day", () => {
    // The core defect, stated directly: two clients who bought the same
    // 30-day pack on the same day get the SAME final moment, whether they
    // paid at 08:00 or at 20:00. Under duration-based expiry the early
    // buyer lost the tail of their last day.
    const early = computePackageExpiresAt(
      new Date("2026-06-23T06:00:00.000Z"),
      30,
    );
    const late = computePackageExpiresAt(
      new Date("2026-06-23T18:00:00.000Z"),
      30,
    );
    const at = new Date("2026-07-22T19:00:00.000Z");
    for (const expiresAt of [early, late]) {
      expect(
        findEligibleClientPackage(
          [makePackage({ expiresAt })],
          [],
          at,
          REFORMER_CLASS_TYPE_ID,
        )?.id,
      ).toBe("pkg-1");
    }
  });

  it("is spent by the first moment of the following day", () => {
    // 00:30 Belgrade on 23 July — the pack is done, and the client should
    // be told to renew rather than silently booking.
    const pkg = makePackage({ expiresAt: lastDayEnd });
    const at = new Date("2026-07-22T22:30:00.000Z");
    expect(
      findEligibleClientPackage([pkg], [], at, REFORMER_CLASS_TYPE_ID),
    ).toBeNull();
    expect(
      classifyRenewalLockReason([pkg], [], at, REFORMER_CLASS_TYPE_ID),
    ).toBe("RENEW");
  });

  it("does not stretch a 30-day pack into a 31st day", () => {
    // The regression guard for the rule "30 days means 30, not 31". The
    // old `startsAt + 30 * 24h` expiry landed on 23 July 07:00Z, which
    // left a 30-day pack bookable on its 31st calendar day. Anyone who
    // reintroduces duration-based expiry fails here.
    const pkg = makePackage({ expiresAt: lastDayEnd });
    const dayThirtyOne = new Date("2026-07-23T04:00:00.000Z");
    expect(
      findEligibleClientPackage([pkg], [], dayThirtyOne, REFORMER_CLASS_TYPE_ID),
    ).toBeNull();
  });
});

describe("findEligibleClientPackage class-scoped behaviour", () => {
  it("a mix package backs a session of any covered class type", () => {
    const mix = {
      id: "mix-1",
      classTypeIds: [REFORMER_CLASS_TYPE_ID, ENERGY_CLASS_TYPE_ID],
      startsAt: new Date("2026-05-01T00:00:00Z"),
      expiresAt: new Date("2026-06-01T00:00:00Z"),
      sessionsRemaining: 5,
      revokedAt: null,
    };
    expect(
      findEligibleClientPackage([mix], [], baseAt, ENERGY_CLASS_TYPE_ID)?.id,
    ).toBe("mix-1");
    expect(
      findEligibleClientPackage([mix], [], baseAt, REFORMER_CLASS_TYPE_ID)?.id,
    ).toBe("mix-1");
  });

  it("returns the pack when classTypeId matches and pack is otherwise valid", () => {
    const pkg = makePackage({});
    const result = findEligibleClientPackage(
      [pkg],
      [],
      baseAt,
      REFORMER_CLASS_TYPE_ID,
    );
    expect(result?.id).toBe(pkg.id);
  });

  it("returns null when the only pack belongs to a different class type", () => {
    const pkg = makePackage({ classTypeIds: [ENERGY_CLASS_TYPE_ID] });
    const result = findEligibleClientPackage(
      [pkg],
      [],
      baseAt,
      REFORMER_CLASS_TYPE_ID,
    );
    expect(result).toBeNull();
  });

  it("ignores matching-class packs with zero sessionsRemaining", () => {
    const pkg = makePackage({ sessionsRemaining: 0 });
    const result = findEligibleClientPackage(
      [pkg],
      [],
      baseAt,
      REFORMER_CLASS_TYPE_ID,
    );
    expect(result).toBeNull();
  });

  it("ignores matching-class packs that have expired", () => {
    const pkg = makePackage({
      startsAt: new Date("2026-04-01T00:00:00Z"),
      expiresAt: new Date("2026-05-01T00:00:00Z"),
    });
    const result = findEligibleClientPackage(
      [pkg],
      [],
      baseAt,
      REFORMER_CLASS_TYPE_ID,
    );
    expect(result).toBeNull();
  });

  it("ignores matching-class packs while inside an active pause window", () => {
    const pkg = makePackage({});
    const pauses = [
      {
        startsAt: new Date("2026-05-10T00:00:00Z"),
        endsAt: new Date("2026-05-20T00:00:00Z"),
      },
    ];
    const result = findEligibleClientPackage(
      [pkg],
      pauses,
      baseAt,
      REFORMER_CLASS_TYPE_ID,
    );
    expect(result).toBeNull();
  });

  it("ignores matching-class packs whose startsAt is in the future", () => {
    const pkg = makePackage({
      startsAt: new Date("2026-06-01T00:00:00Z"),
      expiresAt: new Date("2026-07-01T00:00:00Z"),
    });
    const result = findEligibleClientPackage(
      [pkg],
      [],
      baseAt,
      REFORMER_CLASS_TYPE_ID,
    );
    expect(result).toBeNull();
  });

  it("spends the pack that expires soonest when same-width packs are both valid", () => {
    // Front-desk rule: burn the dying pack first. The soon-expiring pack here
    // is also the OLDER one, so a newest-startsAt rule would wrongly strand it.
    const expiresSoon = makePackage({
      id: "expires-soon",
      startsAt: new Date("2026-04-01T00:00:00Z"),
      expiresAt: new Date("2026-06-01T00:00:00Z"),
    });
    const expiresLater = makePackage({
      id: "expires-later",
      startsAt: new Date("2026-05-10T00:00:00Z"),
      expiresAt: new Date("2026-06-10T00:00:00Z"),
    });
    const result = findEligibleClientPackage(
      [expiresLater, expiresSoon],
      [],
      baseAt,
      REFORMER_CLASS_TYPE_ID,
    );
    expect(result?.id).toBe("expires-soon");
  });

  it("spends a single-type pack before a mix pack covering the same class (narrowest set wins)", () => {
    // The mix pack is newer AND expires sooner — both old tie-breaks would
    // pick it. Scope width must trump both: burning the flexible pack while
    // a narrow pack could cover the session robs the client of Energy slots.
    const mix = makePackage({
      id: "mix",
      classTypeIds: [REFORMER_CLASS_TYPE_ID, ENERGY_CLASS_TYPE_ID],
      startsAt: new Date("2026-05-10T00:00:00Z"),
      expiresAt: new Date("2026-05-25T00:00:00Z"),
    });
    const reformerOnly = makePackage({
      id: "reformer-only",
      startsAt: new Date("2026-04-01T00:00:00Z"),
      expiresAt: new Date("2026-06-01T00:00:00Z"),
    });
    const result = findEligibleClientPackage(
      [mix, reformerOnly],
      [],
      baseAt,
      REFORMER_CLASS_TYPE_ID,
    );
    expect(result?.id).toBe("reformer-only");
  });

  it("falls back to the mix pack when no narrower pack covers the class", () => {
    const mix = makePackage({
      id: "mix",
      classTypeIds: [REFORMER_CLASS_TYPE_ID, ENERGY_CLASS_TYPE_ID],
    });
    const reformerOnly = makePackage({ id: "reformer-only" });
    const result = findEligibleClientPackage(
      [mix, reformerOnly],
      [],
      baseAt,
      ENERGY_CLASS_TYPE_ID,
    );
    expect(result?.id).toBe("mix");
  });

  it("ignores revoked packs even when otherwise valid", () => {
    const pkg = makePackage({ revokedAt: new Date("2026-05-14T00:00:00Z") });
    const result = findEligibleClientPackage(
      [pkg],
      [],
      baseAt,
      REFORMER_CLASS_TYPE_ID,
    );
    expect(result).toBeNull();
  });

  it("falls back to an older non-revoked pack when the newest is revoked", () => {
    const older = makePackage({
      id: "older",
      startsAt: new Date("2026-04-01T00:00:00Z"),
      expiresAt: new Date("2026-06-01T00:00:00Z"),
    });
    const revokedNewer = makePackage({
      id: "revoked-newer",
      startsAt: new Date("2026-05-10T00:00:00Z"),
      expiresAt: new Date("2026-06-10T00:00:00Z"),
      revokedAt: new Date("2026-05-14T00:00:00Z"),
    });
    const result = findEligibleClientPackage(
      [older, revokedNewer],
      [],
      baseAt,
      REFORMER_CLASS_TYPE_ID,
    );
    expect(result?.id).toBe("older");
  });

  it("picks a same-class pack when other-class packs are mixed in", () => {
    const otherClass = makePackage({
      id: "other",
      classTypeIds: [ENERGY_CLASS_TYPE_ID],
      startsAt: new Date("2026-05-12T00:00:00Z"),
    });
    const reformer = makePackage({
      id: "reformer",
      classTypeIds: [REFORMER_CLASS_TYPE_ID],
      startsAt: new Date("2026-05-10T00:00:00Z"),
    });
    const result = findEligibleClientPackage(
      [otherClass, reformer],
      [],
      baseAt,
      REFORMER_CLASS_TYPE_ID,
    );
    expect(result?.id).toBe("reformer");
  });
});

describe("clientOwnsPackageForClass session-visibility behaviour", () => {
  it("counts an expired matching-class pack as owned (session stays visible, greyed)", () => {
    const expired = makePackage({
      startsAt: new Date("2026-03-01T00:00:00Z"),
      expiresAt: new Date("2026-04-01T00:00:00Z"),
    });
    expect(clientOwnsPackageForClass([expired], REFORMER_CLASS_TYPE_ID)).toBe(true);
  });

  it("counts a used-up matching-class pack as owned", () => {
    const usedUp = makePackage({ sessionsRemaining: 0 });
    expect(clientOwnsPackageForClass([usedUp], REFORMER_CLASS_TYPE_ID)).toBe(true);
  });

  it("does not count packs of other class types (keeps fenced classes hidden)", () => {
    const energyOnly = makePackage({ classTypeIds: [ENERGY_CLASS_TYPE_ID] });
    expect(clientOwnsPackageForClass([energyOnly], REFORMER_CLASS_TYPE_ID)).toBe(false);
  });

  it("is false with no packs at all", () => {
    expect(clientOwnsPackageForClass([], REFORMER_CLASS_TYPE_ID)).toBe(false);
  });

  it("a mix pack makes every covered class type visible", () => {
    const mix = makePackage({
      classTypeIds: [REFORMER_CLASS_TYPE_ID, ENERGY_CLASS_TYPE_ID],
    });
    expect(clientOwnsPackageForClass([mix], REFORMER_CLASS_TYPE_ID)).toBe(true);
    expect(clientOwnsPackageForClass([mix], ENERGY_CLASS_TYPE_ID)).toBe(true);
  });
});

describe("classifyRenewalLockReason cause classification", () => {
  it("classifies a used-up mix pack as RENEW for every covered class type", () => {
    const usedUpMix = makePackage({
      classTypeIds: [REFORMER_CLASS_TYPE_ID, ENERGY_CLASS_TYPE_ID],
      sessionsRemaining: 0,
    });
    expect(
      classifyRenewalLockReason([usedUpMix], [], baseAt, ENERGY_CLASS_TYPE_ID),
    ).toBe("RENEW");
  });

  // Only ever called when findEligibleClientPackage returned null but the
  // client owns a matching-class pack — so its job is to pick the BEST reason
  // among the owned matching packs, with priority PAUSED > NOT_STARTED > RENEW.

  it("returns PAUSED when a live matching pack exists and the client is inside a pause window", () => {
    // Pack is otherwise bookable (started, has sessions, unexpired) — the only
    // thing blocking it is the active pause the client chose. Telling this
    // client to "renew" would be wrong.
    const pkg = makePackage({});
    const pauses = [
      {
        startsAt: new Date("2026-05-10T00:00:00Z"),
        endsAt: new Date("2026-05-20T00:00:00Z"),
      },
    ];
    expect(
      classifyRenewalLockReason([pkg], pauses, baseAt, REFORMER_CLASS_TYPE_ID),
    ).toBe("PAUSED");
  });

  it("returns NOT_STARTED when the client owns a matching pack whose startsAt is in the future", () => {
    const future = makePackage({
      startsAt: new Date("2026-06-01T00:00:00Z"),
      expiresAt: new Date("2026-07-01T00:00:00Z"),
    });
    expect(
      classifyRenewalLockReason([future], [], baseAt, REFORMER_CLASS_TYPE_ID),
    ).toBe("NOT_STARTED");
  });

  it("returns RENEW when the only matching pack is used up", () => {
    const usedUp = makePackage({ sessionsRemaining: 0 });
    expect(
      classifyRenewalLockReason([usedUp], [], baseAt, REFORMER_CLASS_TYPE_ID),
    ).toBe("RENEW");
  });

  it("returns RENEW when the only matching pack has expired", () => {
    const expired = makePackage({
      startsAt: new Date("2026-04-01T00:00:00Z"),
      expiresAt: new Date("2026-05-01T00:00:00Z"),
    });
    expect(
      classifyRenewalLockReason([expired], [], baseAt, REFORMER_CLASS_TYPE_ID),
    ).toBe("RENEW");
  });

  it("does NOT report PAUSED for a used-up pack even inside a pause window (renew is the real cause)", () => {
    // A pause window is active, but the only matching pack has no sessions
    // left — the pause is irrelevant, the client genuinely needs to renew.
    const usedUp = makePackage({ sessionsRemaining: 0 });
    const pauses = [
      {
        startsAt: new Date("2026-05-10T00:00:00Z"),
        endsAt: new Date("2026-05-20T00:00:00Z"),
      },
    ];
    expect(
      classifyRenewalLockReason([usedUp], pauses, baseAt, REFORMER_CLASS_TYPE_ID),
    ).toBe("RENEW");
  });

  it("does NOT report PAUSED for an expired pack even inside a pause window", () => {
    const expired = makePackage({
      startsAt: new Date("2026-04-01T00:00:00Z"),
      expiresAt: new Date("2026-05-01T00:00:00Z"),
    });
    const pauses = [
      {
        startsAt: new Date("2026-05-10T00:00:00Z"),
        endsAt: new Date("2026-05-20T00:00:00Z"),
      },
    ];
    expect(
      classifyRenewalLockReason([expired], pauses, baseAt, REFORMER_CLASS_TYPE_ID),
    ).toBe("RENEW");
  });

  it("prefers PAUSED over NOT_STARTED when both a live-but-paused and a future pack are owned", () => {
    const live = makePackage({ id: "live" });
    const future = makePackage({
      id: "future",
      startsAt: new Date("2026-06-01T00:00:00Z"),
      expiresAt: new Date("2026-07-01T00:00:00Z"),
    });
    const pauses = [
      {
        startsAt: new Date("2026-05-10T00:00:00Z"),
        endsAt: new Date("2026-05-20T00:00:00Z"),
      },
    ];
    expect(
      classifyRenewalLockReason(
        [live, future],
        pauses,
        baseAt,
        REFORMER_CLASS_TYPE_ID,
      ),
    ).toBe("PAUSED");
  });

  it("prefers NOT_STARTED over RENEW when both a future and an expired pack are owned", () => {
    const expired = makePackage({
      id: "expired",
      startsAt: new Date("2026-04-01T00:00:00Z"),
      expiresAt: new Date("2026-05-01T00:00:00Z"),
    });
    const future = makePackage({
      id: "future",
      startsAt: new Date("2026-06-01T00:00:00Z"),
      expiresAt: new Date("2026-07-01T00:00:00Z"),
    });
    expect(
      classifyRenewalLockReason(
        [expired, future],
        [],
        baseAt,
        REFORMER_CLASS_TYPE_ID,
      ),
    ).toBe("NOT_STARTED");
  });

  it("ignores packs of other class types when classifying", () => {
    // A future Energy pack shouldn't make the Reformer lock read NOT_STARTED.
    const otherClassFuture = makePackage({
      id: "energy-future",
      classTypeIds: [ENERGY_CLASS_TYPE_ID],
      startsAt: new Date("2026-06-01T00:00:00Z"),
      expiresAt: new Date("2026-07-01T00:00:00Z"),
    });
    const reformerUsedUp = makePackage({
      id: "reformer-used",
      sessionsRemaining: 0,
    });
    expect(
      classifyRenewalLockReason(
        [otherClassFuture, reformerUsedUp],
        [],
        baseAt,
        REFORMER_CLASS_TYPE_ID,
      ),
    ).toBe("RENEW");
  });

  it("ignores revoked packs when classifying NOT_STARTED", () => {
    // A revoked future pack is not a real reason to say "starts soon".
    const revokedFuture = makePackage({
      startsAt: new Date("2026-06-01T00:00:00Z"),
      expiresAt: new Date("2026-07-01T00:00:00Z"),
      revokedAt: new Date("2026-05-14T00:00:00Z"),
    });
    expect(
      classifyRenewalLockReason(
        [revokedFuture],
        [],
        baseAt,
        REFORMER_CLASS_TYPE_ID,
      ),
    ).toBe("RENEW");
  });
});
