// Non-blocking duplicate-assignment hint for the admin assign sheet.
//
// Assigning the same package type to the same client more than once is a
// SUPPORTED action — clients legitimately pay two cycles up front, and package
// stacking handles it. So this never blocks. It only lets the sheet surface a
// visible note when the candidate assignment matches one already made to this
// client on the same calendar day, so an accidental double-submit (the pilot
// saw four identical rows in two pairs) is noticed rather than silent.

type ExistingPackage = {
  packageTypeId: string;
  /** ISO string as returned by the client-packages response. */
  startsAt: string;
};

/** Local calendar-day key (YYYY-MM-DD) — matches the date-only picker. */
function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * True when `existing` already holds a package of `packageTypeId` whose
 * `startsAt` falls on the same local calendar day as `candidateStartsAt`.
 * Returns false whenever the admin hasn't chosen a type or a date yet.
 */
export function assignedSamePackageToday(
  existing: ReadonlyArray<ExistingPackage>,
  packageTypeId: string,
  candidateStartsAt: Date | null,
): boolean {
  if (!packageTypeId || !candidateStartsAt) return false;
  const candidateDay = localDayKey(candidateStartsAt);
  return existing.some(
    (p) =>
      p.packageTypeId === packageTypeId &&
      localDayKey(new Date(p.startsAt)) === candidateDay,
  );
}
