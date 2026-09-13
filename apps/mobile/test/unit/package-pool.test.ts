/**
 * Pool-aware booking math. The unit a client actually spends from is the SET
 * of packages sharing one covered ClassType set — not whichever single package
 * the spend-priority rule picks. See test/unit/package-hold.test.ts for the
 * per-package primitives these build on.
 */
import { describe, expect, it } from "vitest";
import {
  coveredSetKeyOf,
  poolMembers,
  poolBookableSlots,
  poolCanHoldAnotherBooking,
  poolIsLastBookableSlot,
  poolHeldCount,
  pickPoolPackageWithHeadroom,
} from "@/lib/server/package-pool";

const REFORMER = "ct-reformer";
const ENERGY = "ct-energy";
const PERSONALNI = "ct-personalni";

function pkg(overrides: {
  id: string;
  classTypeIds: string[];
  sessionsRemaining?: number;
  startsAt?: Date;
  expiresAt?: Date;
  revokedAt?: Date | null;
}) {
  return {
    id: overrides.id,
    classTypeIds: overrides.classTypeIds,
    sessionsRemaining: overrides.sessionsRemaining ?? 12,
    startsAt: overrides.startsAt ?? new Date("2026-01-01T00:00:00Z"),
    expiresAt: overrides.expiresAt ?? new Date("2026-12-01T00:00:00Z"),
    revokedAt: overrides.revokedAt ?? null,
  };
}

const AT = new Date("2026-05-09T10:00:00Z");

describe("coveredSetKeyOf", () => {
  it("is order-independent so the same set from two queries lands in one pool", () => {
    expect(coveredSetKeyOf(pkg({ id: "a", classTypeIds: [REFORMER, ENERGY] }))).toBe(
      coveredSetKeyOf(pkg({ id: "b", classTypeIds: [ENERGY, REFORMER] })),
    );
  });

  it("separates a narrow set from a superset that contains it", () => {
    expect(coveredSetKeyOf(pkg({ id: "a", classTypeIds: [REFORMER] }))).not.toBe(
      coveredSetKeyOf(pkg({ id: "b", classTypeIds: [REFORMER, ENERGY] })),
    );
  });
});

describe("poolMembers", () => {
  it("gathers every package sharing the spend package's covered set", () => {
    const pack = pkg({ id: "pack12", classTypeIds: [REFORMER], sessionsRemaining: 9 });
    const nadoknada = pkg({
      id: "nadoknada",
      classTypeIds: [REFORMER],
      sessionsRemaining: 1,
      expiresAt: new Date("2026-06-01T00:00:00Z"),
    });
    const members = poolMembers([pack, nadoknada], nadoknada, AT);
    expect(members.map((m) => m.id).sort()).toEqual(["nadoknada", "pack12"]);
  });

  it("excludes packages with a DIFFERENT covered set", () => {
    // A Personalni credit must never mask an empty Reformer pool: the client
    // cannot spend it on a Reformer session.
    const reformer = pkg({ id: "reformer", classTypeIds: [REFORMER], sessionsRemaining: 1 });
    const personalni = pkg({
      id: "personalni",
      classTypeIds: [PERSONALNI],
      sessionsRemaining: 8,
    });
    const members = poolMembers([reformer, personalni], reformer, AT);
    expect(members.map((m) => m.id)).toEqual(["reformer"]);
  });

  it("excludes a mix pack covering the same class but a WIDER set", () => {
    // Reformer+Energy credits are spendable on this Reformer session, but they
    // are not the same pool — merging them would let an Energy-flexible credit
    // silence the Reformer-only pack's last-session warning.
    const reformer = pkg({ id: "reformer", classTypeIds: [REFORMER], sessionsRemaining: 1 });
    const mix = pkg({ id: "mix", classTypeIds: [REFORMER, ENERGY], sessionsRemaining: 8 });
    expect(poolMembers([reformer, mix], reformer, AT).map((m) => m.id)).toEqual([
      "reformer",
    ]);
  });

  it("excludes revoked, expired, unstarted and used-up packages", () => {
    const spend = pkg({ id: "spend", classTypeIds: [REFORMER], sessionsRemaining: 1 });
    const revoked = pkg({
      id: "revoked",
      classTypeIds: [REFORMER],
      sessionsRemaining: 5,
      revokedAt: new Date("2026-04-01T00:00:00Z"),
    });
    const expired = pkg({
      id: "expired",
      classTypeIds: [REFORMER],
      sessionsRemaining: 5,
      expiresAt: new Date("2026-04-01T00:00:00Z"),
    });
    const future = pkg({
      id: "future",
      classTypeIds: [REFORMER],
      sessionsRemaining: 5,
      startsAt: new Date("2026-07-01T00:00:00Z"),
    });
    const spent = pkg({ id: "spent", classTypeIds: [REFORMER], sessionsRemaining: 0 });
    const members = poolMembers([spend, revoked, expired, future, spent], spend, AT);
    expect(members.map((m) => m.id)).toEqual(["spend"]);
  });
});

describe("poolMembers at the session instant", () => {
  it("keeps a pack whose funded window opens after now but covers the session", () => {
    // Eligibility is evaluated at the SESSION's date, not at now — pre-booking
    // a funded future window is allowed. Filtering the pool at now() would drop
    // the spend package from its own pool and report it fully held.
    const future = pkg({
      id: "future",
      classTypeIds: [REFORMER],
      sessionsRemaining: 10,
      startsAt: new Date("2026-06-01T00:00:00Z"),
      expiresAt: new Date("2026-09-01T00:00:00Z"),
    });
    const sessionInstant = new Date("2026-06-15T10:00:00Z");
    expect(poolMembers([future], future, sessionInstant).map((m) => m.id)).toEqual([
      "future",
    ]);
  });
});

describe("poolHeldCount", () => {
  it("sums bookings across the pool but counts the waitlist ONCE", () => {
    // Bookings carry a clientPackageId, waitlist entries do not — they're
    // scoped by class type. Summing countHeldSessions per package would count
    // the same waitlist seat once per package.
    expect(
      poolHeldCount({
        bookingCountsByPackageId: { pack12: 2, nadoknada: 0 },
        waitlistCount: 1,
      }),
    ).toBe(3);
  });

  it("does not multiply the waitlist by the number of packages in the pool", () => {
    const threePackages = poolHeldCount({
      bookingCountsByPackageId: { a: 0, b: 0, c: 0 },
      waitlistCount: 2,
    });
    expect(threePackages).toBe(2);
  });
});

describe("poolBookableSlots", () => {
  it("is summed remaining minus pool holds", () => {
    expect(
      poolBookableSlots({
        packages: [
          pkg({ id: "pack12", classTypeIds: [REFORMER], sessionsRemaining: 9 }),
          pkg({ id: "nadoknada", classTypeIds: [REFORMER], sessionsRemaining: 1 }),
        ],
        heldCount: 0,
      }),
    ).toBe(10);
  });

  it("clamps at zero when holds exceed the pool (admin over-reservation)", () => {
    expect(
      poolBookableSlots({
        packages: [pkg({ id: "a", classTypeIds: [REFORMER], sessionsRemaining: 2 })],
        heldCount: 5,
      }),
    ).toBe(0);
  });
});

describe("poolIsLastBookableSlot", () => {
  it("is FALSE for a 9-remaining pack beside a 1-session nadoknada of the same set", () => {
    // The reported bug: the nadoknada wins spend priority on soonest expiry,
    // so the per-package math said "last session" with 10 slots in the pool.
    const pack = pkg({ id: "pack12", classTypeIds: [REFORMER], sessionsRemaining: 9 });
    const nadoknada = pkg({
      id: "nadoknada",
      classTypeIds: [REFORMER],
      sessionsRemaining: 1,
      expiresAt: new Date("2026-06-01T00:00:00Z"),
    });
    expect(
      poolIsLastBookableSlot({ packages: [pack, nadoknada], heldCount: 0 }),
    ).toBe(false);
  });

  it("is TRUE when the pool itself is down to its final slot", () => {
    const pack = pkg({ id: "pack12", classTypeIds: [REFORMER], sessionsRemaining: 9 });
    const nadoknada = pkg({ id: "nadoknada", classTypeIds: [REFORMER], sessionsRemaining: 1 });
    expect(
      poolIsLastBookableSlot({ packages: [pack, nadoknada], heldCount: 9 }),
    ).toBe(true);
  });

  it("is false once the pool is fully held or empty", () => {
    const pack = pkg({ id: "pack12", classTypeIds: [REFORMER], sessionsRemaining: 10 });
    expect(poolIsLastBookableSlot({ packages: [pack], heldCount: 10 })).toBe(false);
    expect(poolIsLastBookableSlot({ packages: [], heldCount: 0 })).toBe(false);
  });
});

describe("poolCanHoldAnotherBooking", () => {
  it("stays bookable when the fully-held nadoknada sits beside a free 9-pack", () => {
    // The serious half of the bug: the 1-session nadoknada being fully held
    // locked the client out while nine credits sat spendable in the same pool.
    const pack = pkg({ id: "pack12", classTypeIds: [REFORMER], sessionsRemaining: 9 });
    const nadoknada = pkg({ id: "nadoknada", classTypeIds: [REFORMER], sessionsRemaining: 1 });
    expect(
      poolCanHoldAnotherBooking({ packages: [pack, nadoknada], heldCount: 1 }),
    ).toBe(true);
  });

  it("locks when every credit in the pool is held", () => {
    const pack = pkg({ id: "pack12", classTypeIds: [REFORMER], sessionsRemaining: 9 });
    const nadoknada = pkg({ id: "nadoknada", classTypeIds: [REFORMER], sessionsRemaining: 1 });
    expect(
      poolCanHoldAnotherBooking({ packages: [pack, nadoknada], heldCount: 10 }),
    ).toBe(false);
  });

  it("agrees with poolBookableSlots > 0 across the grid", () => {
    for (const remaining of [0, 1, 5, 12]) {
      for (const heldCount of [0, 1, 5, 12, 13]) {
        const packages = [
          pkg({ id: "a", classTypeIds: [REFORMER], sessionsRemaining: remaining }),
        ];
        expect(poolBookableSlots({ packages, heldCount }) > 0).toBe(
          poolCanHoldAnotherBooking({ packages, heldCount }),
        );
      }
    }
  });
});

describe("pickPoolPackageWithHeadroom", () => {
  const pack = pkg({ id: "pack12", classTypeIds: [REFORMER], sessionsRemaining: 9 });
  const nadoknada = pkg({
    id: "nadoknada",
    classTypeIds: [REFORMER],
    sessionsRemaining: 1,
    expiresAt: new Date("2026-06-01T00:00:00Z"),
  });

  it("keeps the spend package when its own credits still have room", () => {
    // Spend priority is unchanged: the soonest-expiring package is still burned
    // first while it has an uncommitted credit.
    expect(
      pickPoolPackageWithHeadroom({
        members: [pack, nadoknada],
        spendPackage: nadoknada,
        bookingCountsByPackageId: { pack12: 0, nadoknada: 0 },
      })?.id,
    ).toBe("nadoknada");
  });

  it("falls through to a sibling when the spend package is fully committed", () => {
    // Consumption decrements the booking's OWN package and no-ops at zero, so
    // attaching an eleventh booking to a 1-session package would silently lose
    // a credit the client paid for.
    expect(
      pickPoolPackageWithHeadroom({
        members: [pack, nadoknada],
        spendPackage: nadoknada,
        bookingCountsByPackageId: { pack12: 0, nadoknada: 1 },
      })?.id,
    ).toBe("pack12");
  });

  it("orders fallbacks by the same priority: soonest expiry first", () => {
    const later = pkg({
      id: "later",
      classTypeIds: [REFORMER],
      sessionsRemaining: 5,
      expiresAt: new Date("2026-11-01T00:00:00Z"),
    });
    const sooner = pkg({
      id: "sooner",
      classTypeIds: [REFORMER],
      sessionsRemaining: 5,
      expiresAt: new Date("2026-07-01T00:00:00Z"),
    });
    expect(
      pickPoolPackageWithHeadroom({
        members: [later, sooner, nadoknada],
        spendPackage: nadoknada,
        bookingCountsByPackageId: { nadoknada: 1 },
      })?.id,
    ).toBe("sooner");
  });

  it("returns null when every member of the pool is fully committed", () => {
    expect(
      pickPoolPackageWithHeadroom({
        members: [pack, nadoknada],
        spendPackage: nadoknada,
        bookingCountsByPackageId: { pack12: 9, nadoknada: 1 },
      }),
    ).toBeNull();
  });
});
