import type { ClientPackage, PackagePause } from "@/generated/prisma";

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
 * True when the client owns ANY pack for this class type, regardless of
 * expiry / remaining sessions / pauses. Drives session VISIBILITY on the
 * client calendar: a lapsed Reformer client still sees Reformer sessions
 * (greyed out, with a renewal CTA) instead of an unexplained empty calendar,
 * while classes they never bought stay hidden.
 */
export function clientOwnsPackageForClass(
  packages: Pick<ClientPackage, "classTypeId">[],
  classTypeId: string,
): boolean {
  return packages.some((pkg) => pkg.classTypeId === classTypeId);
}

export type EligiblePackage = Pick<
  ClientPackage,
  "id" | "classTypeId" | "startsAt" | "expiresAt" | "sessionsRemaining" | "revokedAt"
> & {
  effectiveExpiresAt: Date;
};

/**
 * Returns the newest pack the client could spend on a session at `at` whose
 * class is `classTypeId`. Eligible = matching class, started, has sessions,
 * effective expiry (pause-extended) in the future, `at` not in a pause, and
 * not revoked. `revokedAt` is a REQUIRED input field on purpose — every call
 * site must select it, so a new query can't silently treat a revoked package
 * as bookable.
 */
export function findEligibleClientPackage(
  packages: Pick<
    ClientPackage,
    "id" | "classTypeId" | "startsAt" | "expiresAt" | "sessionsRemaining" | "revokedAt"
  >[],
  pauses: Pick<PackagePause, "startsAt" | "endsAt">[],
  at: Date,
  classTypeId: string,
): EligiblePackage | null {
  const sortedPackages = packages
    .filter((pkg) => pkg.classTypeId === classTypeId)
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  for (const pkg of sortedPackages) {
    if (pkg.revokedAt) continue;
    if (pkg.sessionsRemaining <= 0) continue;
    if (pkg.startsAt > at) continue;
    const effectiveExpiresAt = getEffectiveExpiresAt(pkg, pauses, at);
    if (effectiveExpiresAt < at) continue;
    if (isInPauseWindow(pauses, at)) continue;
    return {
      ...pkg,
      effectiveExpiresAt,
    };
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
  packages: Pick<
    ClientPackage,
    "id" | "classTypeId" | "startsAt" | "expiresAt" | "sessionsRemaining" | "revokedAt"
  >[],
  pauses: Pick<PackagePause, "startsAt" | "endsAt">[],
  at: Date,
  classTypeId: string,
): "PAUSED" | "NOT_STARTED" | "RENEW" {
  const matching = packages.filter(
    (pkg) => pkg.classTypeId === classTypeId && !pkg.revokedAt,
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
