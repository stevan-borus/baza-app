/**
 * The pure decision core of the app-update feature.
 *
 * Two independent "is there something newer?" signals feed in:
 *   - OTA: expo-updates has fetched a new JS bundle compatible with this binary
 *     and it's ready to apply on the next reload.
 *   - Store: our own /api/app-version endpoint reports the minimum-allowed and
 *     latest native binary versions; we compare them against the installed one.
 *
 * Kept pure (no native modules, no I/O) so every precedence and boundary case
 * is unit-testable — the native plumbing lives in useAppUpdates().
 */

export type UpdatePrompt = "none" | "ota" | "store-soft" | "store-required";

export type DecideUpdateInput = {
  /** A new OTA JS bundle has been fetched and is ready to apply. */
  otaReady: boolean;
  /** The installed native binary version (e.g. expo-application's value). */
  currentVersion: string;
  /** Server-reported lowest version still allowed to run. */
  minVersion: string;
  /** Server-reported newest version available on the store. */
  latestVersion: string;
};

/**
 * Parse a marketing version (`major.minor.patch`, extra tokens ignored) into a
 * comparable tuple. Returns null when there's no leading numeric version — the
 * caller treats that as "don't know, don't block".
 */
function parseVersion(value: string): [number, number, number] | null {
  const match = value.trim().match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

/** Returns negative/0/positive like a comparator; null if either is unparseable. */
function compareVersions(a: string, b: string): number | null {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
}

export function decideUpdatePrompt(input: DecideUpdateInput): UpdatePrompt {
  const { otaReady, currentVersion, minVersion, latestVersion } = input;

  // 1. Hard block: installed binary is below the minimum the server allows.
  //    Unparseable versions return null → never block (fail open).
  const vsMin = compareVersions(currentVersion, minVersion);
  if (vsMin !== null && vsMin < 0) return "store-required";

  // 2. A ready OTA bundle wins over a soft (non-blocking) store nudge.
  if (otaReady) return "ota";

  // 3. Soft nudge: a newer binary exists but the current one is still allowed.
  const vsLatest = compareVersions(currentVersion, latestVersion);
  if (vsLatest !== null && vsLatest < 0) return "store-soft";

  return "none";
}
