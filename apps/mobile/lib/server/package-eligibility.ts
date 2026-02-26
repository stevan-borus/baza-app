/**
 * Package eligibility: pause-aware expiry, pause windows, selection for booking/check-in.
 */
import type { ClientPackage, PackagePause } from "@/generated/prisma";

/**
 * Returns overlap (in ms) between a pause interval and the checked period.
 */
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

/**
 * Calculates package expiry extended by paused time up to the evaluated moment.
 */
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

/**
 * Checks whether a specific moment is inside any active pause window.
 */
export function isInPauseWindow(
  pauses: Pick<PackagePause, "startsAt" | "endsAt">[],
  at: Date,
) {
  return pauses.some((pause) => pause.startsAt <= at && pause.endsAt > at);
}

export type EligiblePackage = Pick<
  ClientPackage,
  "id" | "startsAt" | "expiresAt" | "sessionsRemaining"
> & {
  effectiveExpiresAt: Date;
};

/**
 * Picks the most recent valid package for a session timestamp.
 *
 * Uses {@link getEffectiveExpiresAt} and {@link isInPauseWindow} to enforce
 * pause-aware validity and prevent booking/check-in during active pause time.
 */
export function findEligibleClientPackage(
  packages: Pick<
    ClientPackage,
    "id" | "startsAt" | "expiresAt" | "sessionsRemaining"
  >[],
  pauses: Pick<PackagePause, "startsAt" | "endsAt">[],
  at: Date,
): EligiblePackage | null {
  // Prefer newest package first when multiple packages are valid.
  const sortedPackages = [...packages].sort(
    (a, b) => b.startsAt.getTime() - a.startsAt.getTime(),
  );
  for (const pkg of sortedPackages) {
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
