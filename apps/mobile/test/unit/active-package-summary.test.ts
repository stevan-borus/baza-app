import { describe, expect, it } from "vitest";
import { summarizeActivePackages } from "@/lib/active-package-summary";

const NOW = new Date("2026-05-09T10:00:00Z");

type Pkg = Parameters<typeof summarizeActivePackages>[0][number];

const REFORMER = { id: "ct-reformer", name: "Reformer pilates" };
const MOMS = { id: "ct-moms", name: "Reformer pilates (moms & minis)" };
const PERSONAL = { id: "ct-personal", name: "Personalni trening" };
const STRONGHER = { id: "ct-strongher", name: "StrongHer (funkcionalni trening)" };
const ENERGY = { id: "ct-energy", name: "Energy pilates" };

function pkg(overrides: Partial<Pkg> & { id: string }): Pkg {
  return {
    sessionsRemaining: 0,
    sessionsTotal: 0,
    expiresAt: "2026-06-01T00:00:00Z",
    ...overrides,
  } as Pkg;
}

describe("summarizeActivePackages — which packages are eligible at all", () => {
  it("returns an empty array when the client holds no packages at all", () => {
    expect(summarizeActivePackages([], NOW)).toEqual([]);
  });

  it("returns an empty array when every package is lapsed, so the caller falls through to the renewal card", () => {
    expect(
      summarizeActivePackages(
        [
          pkg({ id: "spent", sessionsRemaining: 0, sessionsTotal: 12 }),
          pkg({
            id: "expired",
            sessionsRemaining: 4,
            sessionsTotal: 12,
            expiresAt: "2026-05-01T00:00:00Z",
          }),
        ],
        NOW,
      ),
    ).toEqual([]);
  });

  it("excludes revoked packages even though they keep credits and a future expiry", () => {
    expect(
      summarizeActivePackages(
        [
          pkg({
            id: "revoked",
            sessionsRemaining: 10,
            sessionsTotal: 12,
            expiresAt: "2026-07-01T00:00:00Z",
            revokedAt: "2026-05-05T00:00:00Z",
          }),
        ],
        NOW,
      ),
    ).toEqual([]);
  });

  it("drops a revoked package from a group without dropping the group", () => {
    const groups = summarizeActivePackages(
      [
        pkg({
          id: "live",
          sessionsRemaining: 8,
          sessionsTotal: 12,
          bookable: 8,
          classTypes: [REFORMER],
        }),
        pkg({
          id: "revoked",
          sessionsRemaining: 5,
          sessionsTotal: 5,
          bookable: 5,
          classTypes: [REFORMER],
          revokedAt: "2026-05-05T00:00:00Z",
        }),
      ],
      NOW,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.remaining).toBe(8);
  });

  it("passes a single package straight through as one group", () => {
    const groups = summarizeActivePackages(
      [
        pkg({
          id: "solo",
          sessionsRemaining: 8,
          sessionsTotal: 12,
          bookable: 7,
          expiresAt: "2026-06-01T00:00:00Z",
          classTypes: [REFORMER],
          packageType: { name: "Reformer 12", sessionCount: 12, validityDays: 30 },
        }),
      ],
      NOW,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.remaining).toBe(7);
    expect(groups[0]!.total).toBe(12);
    expect(groups[0]!.sessionsRemaining).toBe(8);
    expect(groups[0]!.primary.id).toBe("solo");
    expect(groups[0]!.expiresAt).toBe("2026-06-01T00:00:00Z");
    expect(groups[0]!.activeCount).toBe(1);
  });
});

describe("summarizeActivePackages — merging within a covered set", () => {
  it("merges packages covering the IDENTICAL class-type set: Reformer 12 + Nadoknada (reformer)", () => {
    // Both cover exactly {Reformer, Moms&Minis}, so a credit from either is
    // spendable on either class — summing them is honest, and the makeup
    // package correctly disappears into a +1 rather than getting its own card.
    const groups = summarizeActivePackages(
      [
        pkg({
          id: "nadoknada",
          sessionsRemaining: 1,
          sessionsTotal: 1,
          bookable: 1,
          expiresAt: "2026-05-20T00:00:00Z",
          classTypes: [MOMS, REFORMER],
          packageType: { name: "Nadoknada (reformer)", sessionCount: 1, validityDays: 14 },
        }),
        pkg({
          id: "reformer12",
          sessionsRemaining: 8,
          sessionsTotal: 12,
          bookable: 8,
          expiresAt: "2026-06-01T00:00:00Z",
          classTypes: [REFORMER, MOMS],
          packageType: { name: "Reformer 12", sessionCount: 12, validityDays: 30 },
        }),
      ],
      NOW,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.remaining).toBe(9);
    expect(groups[0]!.total).toBe(13);
    expect(groups[0]!.primary.id).toBe("reformer12");
    expect(groups[0]!.activeCount).toBe(2);
  });

  it("merges the studio's commonest multi-package shape: 3× a 1-session Reformer 12 reads as 3", () => {
    // Nine of the studio's eleven multi-package clients hold repeats of ONE
    // scope. Three separate cards reading "1" each is the shape this replaces.
    const groups = summarizeActivePackages(
      [
        pkg({ id: "r1", sessionsRemaining: 1, sessionsTotal: 1, bookable: 1, classTypes: [REFORMER, MOMS], expiresAt: "2026-06-20T00:00:00Z" }),
        pkg({ id: "r2", sessionsRemaining: 1, sessionsTotal: 1, bookable: 1, classTypes: [MOMS, REFORMER], expiresAt: "2026-05-15T00:00:00Z" }),
        pkg({ id: "r3", sessionsRemaining: 1, sessionsTotal: 1, bookable: 1, classTypes: [REFORMER, MOMS], expiresAt: "2026-07-01T00:00:00Z" }),
      ],
      NOW,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.remaining).toBe(3);
    expect(groups[0]!.total).toBe(3);
    expect(groups[0]!.activeCount).toBe(3);
  });

  it("prints the SOONEST expiry in a merged group — that is the credit lost first", () => {
    const groups = summarizeActivePackages(
      [
        pkg({ id: "big", sessionsRemaining: 8, sessionsTotal: 12, classTypes: [REFORMER], expiresAt: "2026-06-20T00:00:00Z" }),
        pkg({ id: "makeup", sessionsRemaining: 1, sessionsTotal: 1, classTypes: [REFORMER], expiresAt: "2026-05-15T00:00:00Z" }),
      ],
      NOW,
    );
    // The card headlines the POOL, not the 12-pack, so the deadline that
    // matters is the first one that takes credits out of that pool.
    expect(groups[0]!.primary.id).toBe("big");
    expect(groups[0]!.expiresAt).toBe("2026-05-15T00:00:00Z");
  });

  it("keys the set by sorted ids, so declaration order can never split a group", () => {
    const a = pkg({ id: "a", sessionsRemaining: 3, sessionsTotal: 4, classTypes: [REFORMER, MOMS] });
    const b = pkg({ id: "b", sessionsRemaining: 5, sessionsTotal: 8, classTypes: [MOMS, REFORMER] });
    const groups = summarizeActivePackages([a, b], NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.remaining).toBe(8);
  });

  it("groups packages with no covered set together, apart from scoped ones", () => {
    const groups = summarizeActivePackages(
      [
        pkg({ id: "unscoped-a", sessionsRemaining: 4, sessionsTotal: 4, bookable: 4 }),
        pkg({ id: "unscoped-b", sessionsRemaining: 3, sessionsTotal: 3, bookable: 3 }),
        pkg({ id: "scoped", sessionsRemaining: 2, sessionsTotal: 2, bookable: 2, classTypes: [REFORMER] }),
      ],
      NOW,
    );
    expect(groups).toHaveLength(2);
    expect(groups[0]!.remaining).toBe(7);
    expect(groups[0]!.classTypeNames).toEqual([]);
    expect(groups[1]!.remaining).toBe(2);
  });
});

describe("summarizeActivePackages — one group per covered set, biggest pool first", () => {
  it("never sums DISJOINT sets: a Personalni credit cannot buy a StrongHer class", () => {
    // The bug this replaces: blind summing headlined 24 under "Reformer
    // Personal" while 12 of those credits were only spendable on StrongHer.
    const groups = summarizeActivePackages(
      [
        pkg({
          id: "personal-1",
          sessionsRemaining: 12,
          sessionsTotal: 12,
          bookable: 12,
          classTypes: [PERSONAL],
          packageType: { name: "Reformer Personal", sessionCount: 12, validityDays: 30 },
        }),
        pkg({
          id: "strongher-1",
          sessionsRemaining: 4,
          sessionsTotal: 12,
          bookable: 4,
          classTypes: [STRONGHER],
          packageType: { name: "StrongHer", sessionCount: 12, validityDays: 30 },
        }),
      ],
      NOW,
    );
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.remaining)).toEqual([12, 4]);
    expect(groups.map((g) => g.primary.packageType?.name)).toEqual([
      "Reformer Personal",
      "StrongHer",
    ]);
    expect(groups.every((g) => g.activeCount === 1)).toBe(true);
  });

  it("does NOT merge a superset mix package with the smaller set it contains", () => {
    // "BAZA mix and match" covers 4 class types; Reformer 12 covers 2 of them.
    // The mix credits buy strictly more than the Reformer credits do, so one
    // headline number cannot describe both.
    const groups = summarizeActivePackages(
      [
        pkg({
          id: "mix",
          sessionsRemaining: 10,
          sessionsTotal: 10,
          bookable: 10,
          classTypes: [REFORMER, MOMS, ENERGY, PERSONAL],
          packageType: { name: "BAZA mix and match", sessionCount: 10, validityDays: 30 },
        }),
        pkg({
          id: "reformer12",
          sessionsRemaining: 3,
          sessionsTotal: 12,
          bookable: 3,
          classTypes: [REFORMER, MOMS],
          packageType: { name: "Reformer 12", sessionCount: 12, validityDays: 30 },
        }),
      ],
      NOW,
    );
    expect(groups).toHaveLength(2);
    expect(groups[0]!.primary.id).toBe("mix");
    expect(groups[1]!.primary.id).toBe("reformer12");
  });

  it("returns EVERY group for the 3-scope client — the cap is the screen's call, not the data's", () => {
    // slavica.ilic@demo.baza.rs: 2× Reformer Personal, 2× StrongHer, 3× a
    // 1-session Reformer 12. The helper answers "what does she hold"; how many
    // fit above the fold is layout, and the profile screen wants all of them.
    const groups = summarizeActivePackages(
      [
        pkg({ id: "p1", sessionsRemaining: 12, sessionsTotal: 12, bookable: 12, classTypes: [PERSONAL], packageType: { name: "Reformer Personal", sessionCount: 12, validityDays: 30 } }),
        pkg({ id: "p2", sessionsRemaining: 11, sessionsTotal: 12, bookable: 11, classTypes: [PERSONAL], packageType: { name: "Reformer Personal", sessionCount: 12, validityDays: 30 } }),
        pkg({ id: "s1", sessionsRemaining: 12, sessionsTotal: 12, bookable: 12, classTypes: [STRONGHER], packageType: { name: "StrongHer", sessionCount: 12, validityDays: 30 } }),
        pkg({ id: "s2", sessionsRemaining: 12, sessionsTotal: 12, bookable: 12, classTypes: [STRONGHER], packageType: { name: "StrongHer", sessionCount: 12, validityDays: 30 } }),
        pkg({ id: "r1", sessionsRemaining: 1, sessionsTotal: 1, bookable: 1, classTypes: [REFORMER, MOMS], packageType: { name: "Reformer 12", sessionCount: 12, validityDays: 30 } }),
        pkg({ id: "r2", sessionsRemaining: 1, sessionsTotal: 1, bookable: 1, classTypes: [REFORMER, MOMS], packageType: { name: "Reformer 12", sessionCount: 12, validityDays: 30 } }),
        pkg({ id: "r3", sessionsRemaining: 1, sessionsTotal: 1, bookable: 1, classTypes: [REFORMER, MOMS], packageType: { name: "Reformer 12", sessionCount: 12, validityDays: 30 } }),
      ],
      NOW,
    );
    expect(groups).toHaveLength(3);
    // 24 StrongHer, 23 Personal, 3 Reformer — and never a summed 50.
    expect(groups.map((g) => g.remaining)).toEqual([24, 23, 3]);
    expect(groups.map((g) => g.activeCount)).toEqual([2, 2, 3]);
    expect(groups[0]!.classTypeNames).toEqual(["StrongHer (funkcionalni trening)"]);
  });

  it("orders identically no matter what order the server serialized the packages", () => {
    const personal = pkg({ id: "p", sessionsRemaining: 12, sessionsTotal: 12, bookable: 12, classTypes: [PERSONAL] });
    const strong = pkg({ id: "s", sessionsRemaining: 4, sessionsTotal: 12, bookable: 4, classTypes: [STRONGHER] });
    expect(summarizeActivePackages([personal, strong], NOW).map((g) => g.primary.id)).toEqual(["p", "s"]);
    expect(summarizeActivePackages([strong, personal], NOW).map((g) => g.primary.id)).toEqual(["p", "s"]);
  });

  it("breaks an equal-pool tie deterministically instead of by fetch order", () => {
    const personal = pkg({ id: "p", sessionsRemaining: 12, sessionsTotal: 12, bookable: 12, classTypes: [PERSONAL], expiresAt: "2026-06-10T00:00:00Z" });
    const strong = pkg({ id: "s", sessionsRemaining: 12, sessionsTotal: 12, bookable: 12, classTypes: [STRONGHER], expiresAt: "2026-06-10T00:00:00Z" });
    const first = summarizeActivePackages([personal, strong], NOW).map((g) => g.primary.id);
    const second = summarizeActivePackages([strong, personal], NOW).map((g) => g.primary.id);
    expect(first).toEqual(second);
  });
});

describe("summarizeActivePackages — which package names each card", () => {
  it("does not let array order pick the card name — the makeup package first still loses", () => {
    const makeup = pkg({
      id: "gift",
      sessionsRemaining: 1,
      sessionsTotal: 1,
      classTypes: [REFORMER],
      packageType: { name: "Rođendanski poklon", sessionCount: 1, validityDays: 30 },
    });
    const real = pkg({
      id: "real",
      sessionsRemaining: 5,
      sessionsTotal: 8,
      classTypes: [REFORMER],
      packageType: { name: "Reformer 8", sessionCount: 8, validityDays: 30 },
    });
    expect(summarizeActivePackages([makeup, real], NOW)[0]!.primary.id).toBe("real");
    expect(summarizeActivePackages([real, makeup], NOW)[0]!.primary.id).toBe("real");
  });

  it("breaks a size tie on the soonest expiry, so the card names the package running out first", () => {
    const later = pkg({ id: "later", sessionsRemaining: 12, sessionsTotal: 12, classTypes: [REFORMER], expiresAt: "2026-07-10T00:00:00Z" });
    const sooner = pkg({ id: "sooner", sessionsRemaining: 3, sessionsTotal: 12, classTypes: [REFORMER], expiresAt: "2026-06-10T00:00:00Z" });
    expect(summarizeActivePackages([later, sooner], NOW)[0]!.primary.id).toBe("sooner");
    expect(summarizeActivePackages([sooner, later], NOW)[0]!.primary.id).toBe("sooner");
  });

  it("breaks a size AND expiry tie on id, so the same input never renders two different cards", () => {
    const a = pkg({ id: "aaa", sessionsRemaining: 4, sessionsTotal: 12, classTypes: [REFORMER], expiresAt: "2026-06-10T00:00:00Z" });
    const b = pkg({ id: "bbb", sessionsRemaining: 4, sessionsTotal: 12, classTypes: [REFORMER], expiresAt: "2026-06-10T00:00:00Z" });
    expect(summarizeActivePackages([a, b], NOW)[0]!.primary.id).toBe("aaa");
    expect(summarizeActivePackages([b, a], NOW)[0]!.primary.id).toBe("aaa");
  });
});

describe("summarizeActivePackages — aggregate numbers stay within their group", () => {
  it("prefers bookable over raw credits when summing, since held bookings are not bookable", () => {
    const groups = summarizeActivePackages(
      [
        pkg({ id: "a", sessionsRemaining: 8, sessionsTotal: 12, bookable: 5, classTypes: [REFORMER] }),
        pkg({ id: "b", sessionsRemaining: 1, sessionsTotal: 1, bookable: 0, classTypes: [REFORMER] }),
      ],
      NOW,
    );
    expect(groups[0]!.remaining).toBe(5);
    expect(groups[0]!.sessionsRemaining).toBe(9);
  });

  it("falls back to sessionsRemaining for any package without a bookable count", () => {
    const groups = summarizeActivePackages(
      [
        pkg({ id: "a", sessionsRemaining: 8, sessionsTotal: 12, bookable: 5, classTypes: [REFORMER] }),
        pkg({ id: "b", sessionsRemaining: 2, sessionsTotal: 4, classTypes: [REFORMER] }),
      ],
      NOW,
    );
    expect(groups[0]!.remaining).toBe(7);
  });

  it("flags fully-booked only when every credit in that group is held", () => {
    const held = summarizeActivePackages(
      [
        pkg({ id: "a", sessionsRemaining: 4, sessionsTotal: 12, bookable: 0, classTypes: [REFORMER] }),
        pkg({ id: "b", sessionsRemaining: 1, sessionsTotal: 1, bookable: 0, classTypes: [REFORMER] }),
      ],
      NOW,
    );
    expect(held[0]!.fullyBooked).toBe(true);

    const partly = summarizeActivePackages(
      [
        pkg({ id: "a", sessionsRemaining: 4, sessionsTotal: 12, bookable: 0, classTypes: [REFORMER] }),
        pkg({ id: "b", sessionsRemaining: 1, sessionsTotal: 1, bookable: 1, classTypes: [REFORMER] }),
      ],
      NOW,
    );
    expect(partly[0]!.fullyBooked).toBe(false);
  });

  it("keeps a fully-booked flag inside its own group instead of leaking across scopes", () => {
    const groups = summarizeActivePackages(
      [
        pkg({ id: "reformer", sessionsRemaining: 4, sessionsTotal: 12, bookable: 0, classTypes: [REFORMER] }),
        pkg({ id: "strong", sessionsRemaining: 6, sessionsTotal: 12, bookable: 6, classTypes: [STRONGHER] }),
      ],
      NOW,
    );
    expect(groups[0]!.primary.id).toBe("strong");
    expect(groups[0]!.fullyBooked).toBe(false);
    expect(groups[1]!.fullyBooked).toBe(true);
  });

  it("surfaces payment-pending when any package in that group is unpaid", () => {
    const groups = summarizeActivePackages(
      [
        pkg({ id: "a", sessionsRemaining: 8, sessionsTotal: 12, classTypes: [REFORMER] }),
        pkg({ id: "b", sessionsRemaining: 1, sessionsTotal: 1, paymentPending: true, classTypes: [REFORMER] }),
      ],
      NOW,
    );
    expect(groups[0]!.paymentPending).toBe(true);
  });

  it("keeps the usage fraction coherent with the group aggregate", () => {
    const groups = summarizeActivePackages(
      [
        pkg({ id: "a", sessionsRemaining: 6, sessionsTotal: 12, bookable: 6, classTypes: [REFORMER] }),
        pkg({ id: "b", sessionsRemaining: 1, sessionsTotal: 1, bookable: 1, classTypes: [REFORMER] }),
      ],
      NOW,
    );
    // 7 of 13 bookable → 6/13 used.
    expect(groups[0]!.usedFraction).toBeCloseTo(6 / 13);
  });
});

describe("summarizeActivePackages — covered class types", () => {
  it("prints only its own group's covered set, never the union across groups", () => {
    const groups = summarizeActivePackages(
      [
        pkg({ id: "reformer", sessionsRemaining: 8, sessionsTotal: 12, bookable: 8, classTypes: [REFORMER, MOMS] }),
        pkg({ id: "makeup-energy", sessionsRemaining: 1, sessionsTotal: 1, bookable: 1, classTypes: [ENERGY] }),
      ],
      NOW,
    );
    // Listing "Energy pilates" under a count of 8 Reformer credits would
    // promise a class those credits cannot buy.
    expect(groups[0]!.classTypeNames).toEqual([
      "Reformer pilates",
      "Reformer pilates (moms & minis)",
    ]);
    expect(groups[1]!.classTypeNames).toEqual(["Energy pilates"]);
  });

  it("dedupes names within a group and keeps a stable order", () => {
    const groups = summarizeActivePackages(
      [
        pkg({ id: "a", sessionsRemaining: 8, sessionsTotal: 12, classTypes: [REFORMER, MOMS] }),
        pkg({ id: "b", sessionsRemaining: 2, sessionsTotal: 4, classTypes: [MOMS, REFORMER] }),
      ],
      NOW,
    );
    expect(groups[0]!.classTypeNames).toEqual([
      "Reformer pilates",
      "Reformer pilates (moms & minis)",
    ]);
  });

  it("returns an empty covered set when no package carries one", () => {
    const groups = summarizeActivePackages(
      [pkg({ id: "a", sessionsRemaining: 3, sessionsTotal: 4 })],
      NOW,
    );
    expect(groups[0]!.classTypeNames).toEqual([]);
  });
});
