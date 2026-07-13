/**
 * Duplicate-class-type guard for the admin catalog.
 *
 * Structure rule: a ClassType is what appears on the schedule; the product
 * sold (session count / price) is a PackageType. A real staging incident had
 * "Reformer pilates 8" and "Reformer pilates 12" as two ClassTypes, which
 * fenced 8-pack clients to only the sessions scheduled under "their" type.
 * The creation form uses this check to warn (non-blocking) when a new name
 * looks like a size-variant of an existing class type.
 */

/** Lowercase, strip digits, collapse whitespace — "Reformer pilates 12" → "reformer pilates". */
function normalizeClassTypeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns the first existing class-type name the candidate is suspiciously
 * similar to (normalized names equal or one containing the other), or null.
 * The returned string is the existing name verbatim, ready for display in
 * the warning copy.
 */
export function findSimilarClassTypeName(
  candidate: string,
  existingNames: string[],
): string | null {
  const normalizedCandidate = normalizeClassTypeName(candidate);
  if (!normalizedCandidate) return null;
  for (const existing of existingNames) {
    const normalizedExisting = normalizeClassTypeName(existing);
    if (!normalizedExisting) continue;
    if (
      normalizedCandidate.includes(normalizedExisting) ||
      normalizedExisting.includes(normalizedCandidate)
    ) {
      return existing;
    }
  }
  return null;
}
