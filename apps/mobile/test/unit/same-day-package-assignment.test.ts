import { describe, expect, it } from "vitest";
import { assignedSamePackageToday } from "@/lib/same-day-package-assignment";

// A non-blocking hint for the admin assign sheet: has this client ALREADY
// been given a package of the SAME type on the SAME calendar day as the one
// about to be assigned? Intentional stacking (two cycles paid up front) is
// fully supported — this only surfaces a visible note so an accidental repeat
// is noticed. It never blocks.
describe("assignedSamePackageToday", () => {
  const pkg = (packageTypeId: string, startsAt: string) => ({
    packageTypeId,
    startsAt,
  });

  it("returns true when an existing package has the same type and same day", () => {
    const existing = [pkg("pt-10", "2026-07-13T09:00:00.000Z")];
    expect(
      assignedSamePackageToday(existing, "pt-10", new Date("2026-07-13T18:30:00.000Z")),
    ).toBe(true);
  });

  it("returns false when the same type was assigned on a DIFFERENT day", () => {
    const existing = [pkg("pt-10", "2026-07-09T09:00:00.000Z")];
    expect(
      assignedSamePackageToday(existing, "pt-10", new Date("2026-07-13T09:00:00.000Z")),
    ).toBe(false);
  });

  it("returns false when a DIFFERENT type was assigned the same day", () => {
    const existing = [pkg("pt-99", "2026-07-13T09:00:00.000Z")];
    expect(
      assignedSamePackageToday(existing, "pt-10", new Date("2026-07-13T12:00:00.000Z")),
    ).toBe(false);
  });

  it("returns false for an empty package list", () => {
    expect(assignedSamePackageToday([], "pt-10", new Date("2026-07-13T09:00:00.000Z"))).toBe(
      false,
    );
  });

  it("returns false when no candidate date is chosen yet", () => {
    const existing = [pkg("pt-10", "2026-07-13T09:00:00.000Z")];
    expect(assignedSamePackageToday(existing, "pt-10", null)).toBe(false);
  });

  it("returns false when no package type is chosen yet", () => {
    const existing = [pkg("pt-10", "2026-07-13T09:00:00.000Z")];
    expect(assignedSamePackageToday(existing, "", new Date("2026-07-13T09:00:00.000Z"))).toBe(
      false,
    );
  });

  it("compares by LOCAL calendar day, matching the day-picker the admin uses", () => {
    // Two instants on the same local day resolve to the same day key even
    // when their UTC wall-clock differs — the picker is a date-only control,
    // so the comparison must be local-day, not raw UTC timestamp equality.
    const existing = [pkg("pt-10", new Date("2026-07-13T04:00:00").toISOString())];
    expect(
      assignedSamePackageToday(existing, "pt-10", new Date("2026-07-13T20:00:00")),
    ).toBe(true);
  });
});
