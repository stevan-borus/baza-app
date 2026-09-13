/** Shared package-card math: fully-booked predicate + progress-bar fraction. */

/**
 * Fraction (0..1) the package progress bar should fill on BOTH the home card
 * and the profile "Moji paketi" row.
 *
 * The bar is USAGE-driven (owner decision): it FILLS UP as sessions are booked
 * and consumed — `used / total`, where `used = total − bookableOrRemaining`.
 * Callers pass `bookable ?? sessionsRemaining` so bookable takes precedence when
 * present. A fully-booked package (bookable === 0) reads as a FULL bar; a fresh,
 * untouched package reads as EMPTY. The displayed NUMBER stays "bookable / total";
 * only the bar uses this fraction.
 *
 * (Supersedes the earlier credits-remaining/draining bar, which the owner read
 * as backwards.)
 */
export function packageUsedFraction(
  bookableOrRemaining: number,
  sessionCount: number,
): number {
  if (sessionCount <= 0) return 0;
  const used = sessionCount - bookableOrRemaining;
  const clamped = Math.max(0, Math.min(used, sessionCount));
  return clamped / sessionCount;
}

/**
 * Returns whether the active package is fully RESERVED but not lapsed — i.e.
 * the client has booked every credit they can (`bookable === 0`) while raw
 * credits still remain (`sessionsRemaining > 0`, because held bookings still
 * count against the balance until attended).
 *
 * This is the "0 / 12" state an owner read as broken: the card is still active
 * (it is NOT the lapsed/renewal case) and must show an explanatory line. The
 * lapsed case has `sessionsRemaining === 0`, so it is excluded here and keeps
 * routing to the RenewalCard instead.
 */
export function isFullyBookedActivePackage(
  bookable: number,
  sessionsRemaining: number,
): boolean {
  return bookable === 0 && sessionsRemaining > 0;
}

/**
 * Whether a package should present as the client's ACTIVE package on the home
 * card and the profile "Moji paketi" list — started, credits remaining, not
 * past expiry, and NOT revoked.
 *
 * `revokedAt` is the load-bearing addition: a revoked package keeps its credits
 * and future expiry (keep-the-trace semantics), so the old `sessionsRemaining >
 * 0 && expiresAt > now` test rendered it as the bookable active card while the
 * server 409'd every booking it invited. A revoked-only client must fall
 * through to the RenewalCard / "no active package" state exactly like a lapsed
 * client. The greyed-calendar visibility path deliberately still shows revoked
 * packages and is unaffected.
 *
 * `startsAt` is the same bug one field over: a package bought ahead carries its
 * credits and a far-off expiry from the day it is assigned, so without this
 * check a package dated to start in November reads as the client's current one
 * in September. A not-yet-started package is UPCOMING, not active, and booking
 * against it is what the server refuses. Admin client-detail already excludes
 * it, so leaving it in here made the two surfaces disagree about one package.
 *
 * A missing or null `startsAt` counts as already started. The field is required
 * on the wire, so absence means an older cached payload — and a client's own
 * package vanishing from their screen is worse than briefly showing one that
 * starts a day early.
 */
export function isActiveClientPackage(
  pkg: {
    sessionsRemaining: number;
    expiresAt: string;
    revokedAt?: string | null;
    startsAt?: string | null;
  },
  now: Date,
): boolean {
  if (pkg.revokedAt) return false;
  if (pkg.sessionsRemaining <= 0) return false;
  if (pkg.startsAt && new Date(pkg.startsAt) > now) return false;
  return new Date(pkg.expiresAt) > now;
}

/**
 * Whether a package is bought-and-paid-for but NOT YET USABLE — assigned with
 * a `startsAt` the studio dated into the future.
 *
 * This is the other half of `isActiveClientPackage`, and it exists because
 * "not bookable yet" had been implemented as "does not exist". A client handed
 * two Nadoknada packages, one starting today and one in five days, could see
 * only the first: three separate client-side filters dropped anything with a
 * future `startsAt` and no surface picked it back up. The credits were never
 * lost server-side — they were simply unrenderable.
 *
 * The two predicates are mutually exclusive by construction and share every
 * non-date gate, so a package is active, upcoming, or neither — never both:
 *
 * - `revokedAt` wins outright. A package the studio took back is not "coming";
 *   announcing a start date for it would promise credits every booking 409s.
 * - Zero `sessionsRemaining` is not coming either. A spent package with a
 *   future start is an artefact, not an announcement.
 * - Past `expiresAt` short-circuits the same way — nothing to look forward to.
 *
 * A missing or null `startsAt` counts as ALREADY STARTED, matching
 * `isActiveClientPackage`. The field is required on the wire, so absence means
 * an older cached payload, and a package must not migrate into the upcoming
 * section merely because the cache predates the field.
 */
export function isUpcomingClientPackage(
  pkg: {
    sessionsRemaining: number;
    expiresAt: string;
    revokedAt?: string | null;
    startsAt?: string | null;
  },
  now: Date,
): boolean {
  if (pkg.revokedAt) return false;
  if (pkg.sessionsRemaining <= 0) return false;
  if (new Date(pkg.expiresAt) <= now) return false;
  return !!pkg.startsAt && new Date(pkg.startsAt) > now;
}

/**
 * Every not-yet-started package, soonest start first.
 *
 * Ordering is by start date rather than expiry because the question this list
 * answers is "when can I use something again" — the nearest start is the one
 * both the admin and the client are waiting on. (The active lists order by
 * soonest EXPIRY, which answers the opposite question: what to spend first.)
 */
export function upcomingClientPackages<
  T extends {
    sessionsRemaining: number;
    expiresAt: string;
    revokedAt?: string | null;
    startsAt?: string | null;
  },
>(packages: T[], now: Date): T[] {
  return packages
    .filter((pkg) => isUpcomingClientPackage(pkg, now))
    .sort(
      (a, b) =>
        new Date(a.startsAt ?? 0).getTime() - new Date(b.startsAt ?? 0).getTime(),
    );
}
