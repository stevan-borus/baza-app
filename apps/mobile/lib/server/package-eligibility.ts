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

export type EligiblePackage = Pick<
  ClientPackage,
  "id" | "classTypeId" | "startsAt" | "expiresAt" | "sessionsRemaining"
> & {
  effectiveExpiresAt: Date;
};

/**
 * Returns the newest pack the client could spend on a session at `at` whose
 * class is `classTypeId`. Eligible = matching class, started, has sessions,
 * effective expiry (pause-extended) in the future, and `at` not in a pause.
 */
export function findEligibleClientPackage(
  packages: Pick<
    ClientPackage,
    "id" | "classTypeId" | "startsAt" | "expiresAt" | "sessionsRemaining"
  >[],
  pauses: Pick<PackagePause, "startsAt" | "endsAt">[],
  at: Date,
  classTypeId: string,
): EligiblePackage | null {
  const sortedPackages = packages
    .filter((pkg) => pkg.classTypeId === classTypeId)
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
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
