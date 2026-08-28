/**
 * One green card per SPENDABLE POOL of a client's active packages.
 *
 * The home screen used to `.find()` the first active package, which on studio
 * data is a coin flip: clients routinely hold 2–7 active packages, and the
 * studio's 1-session "Nadoknada" makeup and birthday-gift packages sit right
 * beside the real 12-pack. The card could therefore headline "1" while the
 * client actually had nine sessions left. The studio's ask — "izbaciti
 * nadoknadu sa početne stranice, samo povećati broj preostalih termina" — is
 * exactly this: a makeup package is a +1, never a card of its own.
 *
 * But "+1" is only true when the two packages buy the SAME classes. A
 * ClientPackage snapshots a ClassType SET and a Booking is backable only if the
 * Session's ClassType is in that set (CONTEXT.md → PackageType). Credits are
 * therefore interchangeable only WITHIN a set: summing a Personalni trening
 * package with a StrongHer one produces a number the client cannot spend.
 *
 * So the unit here is the covered ClassType set. Packages sharing one merge
 * into a single summary; distinct sets stay distinct summaries. That matches
 * what the studio's clients actually hold — of eleven with active packages,
 * nine hold repeats of ONE set (three 1-session Reformer 12s reading "3", not
 * three cards reading "1"), one holds two sets, one holds three.
 *
 * The array is ordered by largest bookable pool first and is COMPLETE — every
 * group, never truncated. How many fit above the fold is the calling screen's
 * decision, and the two screens disagree: home shows the top two plus a link,
 * Moji paketi itemises all of them. Truncating here would also cost the caller
 * the count it needs to pick "TVOJ PAKET" vs "TVOJI PAKETI".
 */
import type { ClientPackage } from "@baza/types/packages";
import {
  isActiveClientPackage,
  packageUsedFraction,
} from "@/lib/package-fully-booked";

export type ActivePackageSummary = {
  /** The package whose name the card shows. */
  primary: ClientPackage;
  /** Every package folded into the card — same covered set, `primary` included. */
  packages: ClientPackage[];
  /** How many packages this card stands for — 1 means nothing was folded. */
  activeCount: number;
  /** Headline count: summed `bookable ?? sessionsRemaining` within the group. */
  remaining: number;
  /** Denominator: summed grant-aware `sessionsTotal` within the group. */
  total: number;
  /** Summed raw credits in the group, before held bookings are subtracted. */
  sessionsRemaining: number;
  /** The SOONEST expiry in the group — the credits the client loses first. */
  expiresAt: string;
  /** Bar fill, driven by the group aggregate so it can't contradict the numbers. */
  usedFraction: number;
  /**
   * The covered ClassType names of THIS group — every package in it snapshots
   * the same set, so this is exactly what the headline count can be spent on.
   */
  classTypeNames: string[];
  /** Every credit in the group is already held by a future booking. */
  fullyBooked: boolean;
  /** At least one package in the group is still awaiting payment. */
  paymentPending: boolean;
};

/**
 * Order-independent identity for a covered ClassType set.
 *
 * Sorted ids joined, so `[Reformer, Moms]` and `[Moms, Reformer]` — the same
 * scope arriving in whatever order the server serialized it — land in one
 * group. Keying on array order would split a group per fetch; keying on NAMES
 * would merge two distinct ClassTypes that happen to share a name.
 *
 * A package with no snapshotted set gets its own bucket rather than merging
 * into a scoped one: an unknown scope is not evidence of a shared scope.
 */
function coveredSetKey(pkg: ClientPackage): string {
  const ids = (pkg.classTypes ?? []).map((ct) => ct.id);
  if (ids.length === 0) return " unscoped";
  return [...ids].sort().join(" ");
}

/**
 * Ordering that decides which package names the card within its group.
 *
 * 1. Largest effective total first — a 12-pack outranks a 1-session makeup,
 *    which is the whole point. `sessionsTotal` is the server's grant-aware
 *    `sessionsGranted + bonusSessions` (see `lib/package-total.ts`); the raw
 *    `packageType.sessionCount` would rank a 1-session gift off a 12-session
 *    SKU as a 12-pack.
 * 2. Then soonest expiry — between two equal packages the client cares about
 *    the one about to lapse.
 * 3. Then id — so a client with two identical packages sees the same card on
 *    every render instead of one that flips with fetch order.
 */
function comparePrimaryCandidates(a: ClientPackage, b: ClientPackage): number {
  if (b.sessionsTotal !== a.sessionsTotal) return b.sessionsTotal - a.sessionsTotal;
  const expiryDelta =
    new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
  if (expiryDelta !== 0) return expiryDelta;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function bookableOf(pkg: ClientPackage): number {
  return pkg.bookable ?? pkg.sessionsRemaining;
}

function summarizeGroup(members: ClientPackage[]): ActivePackageSummary {
  const ordered = [...members].sort(comparePrimaryCandidates);
  const primary = ordered[0]!;

  // Every member snapshots the same set, so this union IS that set — the dedupe
  // only collapses the repeats. Primary first, so the most relevant class type
  // heads the line.
  const classTypeNames = [
    ...new Set(ordered.flatMap((p) => (p.classTypes ?? []).map((ct) => ct.name))),
  ];

  const remaining = ordered.reduce((sum, p) => sum + bookableOf(p), 0);
  const total = ordered.reduce((sum, p) => sum + p.sessionsTotal, 0);
  const sessionsRemaining = ordered.reduce((sum, p) => sum + p.sessionsRemaining, 0);

  return {
    primary,
    packages: ordered,
    activeCount: ordered.length,
    remaining,
    total,
    sessionsRemaining,
    // The SOONEST date in the group, not the primary's own. The card headlines
    // one merged pool, so the deadline that matters is the first one that takes
    // credits OUT of that pool — a 12-pack's later date under a summed count
    // would promise the makeup credit survives to it.
    expiresAt: ordered.reduce(
      (soonest, p) =>
        new Date(p.expiresAt).getTime() < new Date(soonest).getTime()
          ? p.expiresAt
          : soonest,
      primary.expiresAt,
    ),
    classTypeNames,
    usedFraction: packageUsedFraction(remaining, total),
    // Group-wide, not per-package: one bookable credit in this pool means the
    // client can still book it, so the "you've reserved everything" hint stays off.
    fullyBooked: remaining === 0 && sessionsRemaining > 0,
    paymentPending: ordered.some((p) => p.paymentPending === true),
  };
}

/**
 * Folds a client's packages into one summary per covered ClassType set,
 * largest bookable pool first.
 *
 * Empty array when nothing is active — which keeps the caller's fall-through
 * to the renewal card intact for lapsed, spent and revoked-only clients alike
 * (`isActiveClientPackage` owns that predicate, revoked packages included).
 */
export function summarizeActivePackages(
  packages: ClientPackage[],
  currentInstant: Date,
): ActivePackageSummary[] {
  const byKey = new Map<string, ClientPackage[]>();
  for (const pkg of packages) {
    if (!isActiveClientPackage(pkg, currentInstant)) continue;
    const key = coveredSetKey(pkg);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(pkg);
    else byKey.set(key, [pkg]);
  }

  return [...byKey.values()].map(summarizeGroup).sort((a, b) => {
    if (b.remaining !== a.remaining) return b.remaining - a.remaining;
    // Same pool size: fall through to the same package ordering used WITHIN a
    // group, so two equal groups never swap places between fetches.
    return comparePrimaryCandidates(a.primary, b.primary);
  });
}
