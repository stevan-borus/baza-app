import { describe, expect, it } from "vitest";
import { findEligibleClientPackage } from "@/lib/server/package-eligibility";

const REFORMER_CLASS_TYPE_ID = "11111111-1111-1111-1111-111111111111";
const ENERGY_CLASS_TYPE_ID = "22222222-2222-2222-2222-222222222222";

const baseAt = new Date("2026-05-15T10:00:00Z");

function makePackage(overrides: Partial<{
  id: string;
  classTypeId: string;
  startsAt: Date;
  expiresAt: Date;
  sessionsRemaining: number;
  revokedAt: Date | null;
}>) {
  return {
    id: overrides.id ?? "pkg-1",
    classTypeId: overrides.classTypeId ?? REFORMER_CLASS_TYPE_ID,
    startsAt: overrides.startsAt ?? new Date("2026-05-01T00:00:00Z"),
    expiresAt: overrides.expiresAt ?? new Date("2026-06-01T00:00:00Z"),
    sessionsRemaining: overrides.sessionsRemaining ?? 5,
    revokedAt: overrides.revokedAt ?? null,
  };
}

describe("findEligibleClientPackage class-scoped behaviour", () => {
  it("returns the pack when classTypeId matches and pack is otherwise valid", () => {
    const pkg = makePackage({});
    const result = findEligibleClientPackage(
      [pkg],
      [],
      baseAt,
      REFORMER_CLASS_TYPE_ID,
    );
    expect(result?.id).toBe(pkg.id);
  });

  it("returns null when the only pack belongs to a different class type", () => {
    const pkg = makePackage({ classTypeId: ENERGY_CLASS_TYPE_ID });
    const result = findEligibleClientPackage(
      [pkg],
      [],
      baseAt,
      REFORMER_CLASS_TYPE_ID,
    );
    expect(result).toBeNull();
  });

  it("ignores matching-class packs with zero sessionsRemaining", () => {
    const pkg = makePackage({ sessionsRemaining: 0 });
    const result = findEligibleClientPackage(
      [pkg],
      [],
      baseAt,
      REFORMER_CLASS_TYPE_ID,
    );
    expect(result).toBeNull();
  });

  it("ignores matching-class packs that have expired", () => {
    const pkg = makePackage({
      startsAt: new Date("2026-04-01T00:00:00Z"),
      expiresAt: new Date("2026-05-01T00:00:00Z"),
    });
    const result = findEligibleClientPackage(
      [pkg],
      [],
      baseAt,
      REFORMER_CLASS_TYPE_ID,
    );
    expect(result).toBeNull();
  });

  it("ignores matching-class packs while inside an active pause window", () => {
    const pkg = makePackage({});
    const pauses = [
      {
        startsAt: new Date("2026-05-10T00:00:00Z"),
        endsAt: new Date("2026-05-20T00:00:00Z"),
      },
    ];
    const result = findEligibleClientPackage(
      [pkg],
      pauses,
      baseAt,
      REFORMER_CLASS_TYPE_ID,
    );
    expect(result).toBeNull();
  });

  it("ignores matching-class packs whose startsAt is in the future", () => {
    const pkg = makePackage({
      startsAt: new Date("2026-06-01T00:00:00Z"),
      expiresAt: new Date("2026-07-01T00:00:00Z"),
    });
    const result = findEligibleClientPackage(
      [pkg],
      [],
      baseAt,
      REFORMER_CLASS_TYPE_ID,
    );
    expect(result).toBeNull();
  });

  it("prefers the newest startsAt when multiple matching packs are valid", () => {
    const older = makePackage({
      id: "older",
      startsAt: new Date("2026-04-01T00:00:00Z"),
      expiresAt: new Date("2026-06-01T00:00:00Z"),
    });
    const newer = makePackage({
      id: "newer",
      startsAt: new Date("2026-05-10T00:00:00Z"),
      expiresAt: new Date("2026-06-10T00:00:00Z"),
    });
    const result = findEligibleClientPackage(
      [older, newer],
      [],
      baseAt,
      REFORMER_CLASS_TYPE_ID,
    );
    expect(result?.id).toBe("newer");
  });

  it("ignores revoked packs even when otherwise valid", () => {
    const pkg = makePackage({ revokedAt: new Date("2026-05-14T00:00:00Z") });
    const result = findEligibleClientPackage(
      [pkg],
      [],
      baseAt,
      REFORMER_CLASS_TYPE_ID,
    );
    expect(result).toBeNull();
  });

  it("falls back to an older non-revoked pack when the newest is revoked", () => {
    const older = makePackage({
      id: "older",
      startsAt: new Date("2026-04-01T00:00:00Z"),
      expiresAt: new Date("2026-06-01T00:00:00Z"),
    });
    const revokedNewer = makePackage({
      id: "revoked-newer",
      startsAt: new Date("2026-05-10T00:00:00Z"),
      expiresAt: new Date("2026-06-10T00:00:00Z"),
      revokedAt: new Date("2026-05-14T00:00:00Z"),
    });
    const result = findEligibleClientPackage(
      [older, revokedNewer],
      [],
      baseAt,
      REFORMER_CLASS_TYPE_ID,
    );
    expect(result?.id).toBe("older");
  });

  it("picks a same-class pack when other-class packs are mixed in", () => {
    const otherClass = makePackage({
      id: "other",
      classTypeId: ENERGY_CLASS_TYPE_ID,
      startsAt: new Date("2026-05-12T00:00:00Z"),
    });
    const reformer = makePackage({
      id: "reformer",
      classTypeId: REFORMER_CLASS_TYPE_ID,
      startsAt: new Date("2026-05-10T00:00:00Z"),
    });
    const result = findEligibleClientPackage(
      [otherClass, reformer],
      [],
      baseAt,
      REFORMER_CLASS_TYPE_ID,
    );
    expect(result?.id).toBe("reformer");
  });
});
