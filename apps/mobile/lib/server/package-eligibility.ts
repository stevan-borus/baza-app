import type { ClientPackage, PackagePause } from "@/generated/prisma";

/**
 * The package shape all eligibility logic runs on. `classTypeIds` is the
 * ClientPackage's snapshotted ClassType set (one element for a classic
 * single-type package, several for a mix package) — callers flatten the
 * join rows into ids before calling in.
 */
export type EligibilityPackage = Pick<
  ClientPackage,
  "id" | "startsAt" | "expiresAt" | "sessionsRemaining" | "revokedAt"
> & {
  classTypeIds: string[];
};

/**
 * The canonical Prisma select for feeding eligibility logic — pairs with
 * `toEligibilityPackage` to flatten the join rows into `classTypeIds`.
 */
export const ELIGIBILITY_PACKAGE_SELECT = {
  id: true,
  startsAt: true,
  expiresAt: true,
  sessionsRemaining: true,
  revokedAt: true,
  classTypes: { select: { classTypeId: true } },
} as const;

export function toEligibilityPackage<
  T extends { classTypes: { classTypeId: string }[] },
>(row: T): Omit<T, "classTypes"> & { classTypeIds: string[] } {
  const { classTypes, ...rest } = row;
  return { ...rest, classTypeIds: classTypes.map((link) => link.classTypeId) };
}

function getPauseOverlapMs(
  pause: Pick<PackagePause, "startsAt" | "endsAt">,
  periodStart: Date,
  periodEnd: Date,
) {
  const overlapStart = Math.max(
    pause.startsAt.getTime(),
    periodStart.getTime(),
  );
  const overlapEnd = Math.min(pause.endsAt.getTime(), periodEnd.getTime());
  return Math.max(overlapEnd - overlapStart, 0);
}

export function getEffectiveExpiresAt(
  pkg: Pick<ClientPackage, "startsAt" | "expiresAt">,
  pauses: Pick<PackagePause, "startsAt" | "endsAt">[],
  at: Date,
) {
  const extensionMs = pauses.reduce((total, pause) => {
    return total + getPauseOverlapMs(pause, pkg.startsAt, at);
  }, 0);
  return new Date(pkg.expiresAt.getTime() + extensionMs);
}

export function isInPauseWindow(
  pauses: Pick<PackagePause, "startsAt" | "endsAt">[],
  at: Date,
) {
  return pauses.some((pause) => pause.startsAt <= at && pause.endsAt > at);
}

/**
 * True when the client owns ANY pack covering this class type, regardless of
 * expiry / remaining sessions / pauses. Drives session VISIBILITY on the
 * client calendar: a lapsed Reformer client still sees Reformer sessions
 * (greyed out, with a renewal CTA) instead of an unexplained empty calendar,
 * while classes they never bought stay hidden.
 */
export function clientOwnsPackageForClass(
  packages: Pick<EligibilityPackage, "classTypeIds">[],
  classTypeId: string,
): boolean {
  return packages.some((pkg) => pkg.classTypeIds.includes(classTypeId));
}

export type EligiblePackage = EligibilityPackage & {
  effectiveExpiresAt: Date;
};

/**
 * Returns the pack the client should spend on a session at `at` whose class
 * is `classTypeId`. Eligible = ClassType set covers the class, started, has
 * sessions, effective expiry (pause-extended) in the future, `at` not in a
 * pause, and not revoked. `revokedAt` is a REQUIRED input field on purpose —
 * every call site must select it, so a new query can't silently treat a
 * revoked package as bookable.
 *
 * Spend priority when several packs are eligible (ADR-0010): the NARROWEST
 * ClassType set wins — a single-type pack is spent before a mix pack, so the
 * mix pack's flexibility survives — then the soonest effective expiry, so the
 * dying pack is burned first.
 */
export function findEligibleClientPackage(
  packages: EligibilityPackage[],
  pauses: Pick<PackagePause, "startsAt" | "endsAt">[],
  at: Date,
  classTypeId: string,
): EligiblePackage | null {
  const candidates = packages
    .filter((pkg) => pkg.classTypeIds.includes(classTypeId))
    .map((pkg) => ({
      ...pkg,
      effectiveExpiresAt: getEffectiveExpiresAt(pkg, pauses, at),
    }))
    .sort(
      (a, b) =>
        a.classTypeIds.length - b.classTypeIds.length ||
        a.effectiveExpiresAt.getTime() - b.effectiveExpiresAt.getTime(),
    );
  for (const pkg of candidates) {
    if (pkg.revokedAt) continue;
    if (pkg.sessionsRemaining <= 0) continue;
    if (pkg.startsAt > at) continue;
    if (pkg.effectiveExpiresAt < at) continue;
    if (isInPauseWindow(pauses, at)) continue;
    return pkg;
  }
  return null;
}

/**
 * Why a client can't book despite OWNING a matching-class pack — the specific
 * cause behind a `lockReason: "RENEW"`-style lock. Call this ONLY once
 * `findEligibleClientPackage` has returned null but `clientOwnsPackageForClass`
 * is true; it picks the most truthful, most actionable reason among the owned
 * matching packs.
 *
 * Priority — PAUSED > NOT_STARTED > RENEW:
 * - PAUSED: the client is inside an active pause window AND owns a matching
 *   pack that would otherwise be bookable (started, has sessions, not expired,
 *   not revoked). They paused on purpose — telling them to "renew" is wrong.
 *   Gated on a genuinely-live pack so a used-up/expired pack that merely
 *   overlaps a pause doesn't masquerade as paused.
 * - NOT_STARTED: they own a matching pack (has sessions, not expired, not
 *   revoked) whose `startsAt` is in the future — a real, funded pack that
 *   simply hasn't begun. Ranked below PAUSED because an active pause is the
 *   more immediate explanation.
 * - RENEW: catch-all — every matching pack is used up, expired, or revoked.
 */
export function classifyRenewalLockReason(
  packages: EligibilityPackage[],
  pauses: Pick<PackagePause, "startsAt" | "endsAt">[],
  at: Date,
  classTypeId: string,
): "PAUSED" | "NOT_STARTED" | "RENEW" {
  const matching = packages.filter(
    (pkg) => pkg.classTypeIds.includes(classTypeId) && !pkg.revokedAt,
  );

  // A "would-be-bookable" pack: has sessions and its pause-extended expiry is
  // still in the future. (Pause state itself is handled separately below.)
  const hasLivePack = matching.some(
    (pkg) =>
      pkg.sessionsRemaining > 0 &&
      getEffectiveExpiresAt(pkg, pauses, at) >= at,
  );
  if (hasLivePack && isInPauseWindow(pauses, at)) {
    return "PAUSED";
  }

  const hasFuturePack = matching.some(
    (pkg) => pkg.sessionsRemaining > 0 && pkg.startsAt > at,
  );
  if (hasFuturePack) {
    return "NOT_STARTED";
  }

  return "RENEW";
}
