import { type ClientPackageStatus } from "@baza/types/packages";

export const EXPIRING_WINDOW_DAYS = 14;

export function expiringThresholdFrom(at: Date) {
  return new Date(at.getTime() + EXPIRING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * The single package chip shown for a client.
 * Priority: paused (overrides everything) > active > expiring > expired > none.
 * Revoked packages must be filtered out by the caller — they grant nothing.
 */
export function deriveClientPackageStatus({
  packages,
  hasActivePause,
  at,
  expiringThreshold,
}: {
  packages: { sessionsRemaining: number; expiresAt: Date }[];
  hasActivePause: boolean;
  at: Date;
  expiringThreshold: Date;
}): ClientPackageStatus {
  if (hasActivePause) return "paused";

  let status: ClientPackageStatus = "none";
  let hasExpired = false;

  for (const p of packages) {
    if (p.expiresAt < at || p.sessionsRemaining <= 0) {
      hasExpired = true;
      continue;
    }
    if (p.expiresAt <= expiringThreshold) {
      if (status !== "active") status = "expiring";
    } else {
      status = "active";
    }
  }

  if (status === "none" && hasExpired) status = "expired";
  return status;
}
