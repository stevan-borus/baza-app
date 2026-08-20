import { describe, expect, it } from "vitest";
import {
  createTrainerRateInputSchema,
  trainerRateSchema,
} from "@baza/types/payroll";

/**
 * How precise a commission is allowed to be.
 *
 * The studio was assumed to negotiate in whole points, and it doesn't: a
 * trainer moving from 22% to 22.5% was simply unrepresentable. One decimal is
 * the range real agreements use — half a point — and the cap is deliberate,
 * because 22.55% is a number nobody agreed to and every payout would carry the
 * rounding of it forever.
 */

const base = {
  trainerUserId: "trainer-1",
  effectiveFrom: "2026-09-01",
};

describe("createTrainerRateInputSchema percent precision", () => {
  it("accepts a half point", () => {
    const parsed = createTrainerRateInputSchema.parse({ ...base, percent: 22.5 });
    expect(parsed.percent).toBe(22.5);
  });

  it("still accepts whole percents", () => {
    expect(createTrainerRateInputSchema.parse({ ...base, percent: 40 }).percent).toBe(40);
    expect(createTrainerRateInputSchema.parse({ ...base, percent: 0 }).percent).toBe(0);
    expect(createTrainerRateInputSchema.parse({ ...base, percent: 100 }).percent).toBe(100);
  });

  it("rejects two decimal places", () => {
    const result = createTrainerRateInputSchema.safeParse({ ...base, percent: 22.55 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["percent"]);
  });

  it("does not reject a half point as float noise", () => {
    // 0.1 + 0.2 arithmetic must not make a legitimate rate unsavable.
    for (const value of [0.1, 12.3, 33.7, 99.9, 7.1]) {
      expect(
        createTrainerRateInputSchema.safeParse({ ...base, percent: value }).success,
        `${value} should be a valid one-decimal percent`,
      ).toBe(true);
    }
  });

  it("keeps the 0–100 bounds", () => {
    expect(createTrainerRateInputSchema.safeParse({ ...base, percent: -0.5 }).success).toBe(false);
    expect(createTrainerRateInputSchema.safeParse({ ...base, percent: 100.5 }).success).toBe(false);
  });

  it("keeps the tombstone rule: null only on a class-type override", () => {
    expect(
      createTrainerRateInputSchema.safeParse({ ...base, percent: null }).success,
    ).toBe(false);
    expect(
      createTrainerRateInputSchema.safeParse({
        ...base,
        percent: null,
        classTypeId: "ct-1",
      }).success,
    ).toBe(true);
  });
});

describe("trainerRateSchema percent precision", () => {
  const row = {
    id: "rate-1",
    trainerUserId: "trainer-1",
    classTypeId: null,
    classTypeName: null,
    effectiveFrom: "2026-09-01T03:00:00.000Z",
    note: null,
    createdAt: "2026-09-01T03:00:00.000Z",
    seq: 1,
  };

  it("reads a half point back off the wire", () => {
    expect(trainerRateSchema.parse({ ...row, percent: 22.5 }).percent).toBe(22.5);
  });

  it("rejects a wire value with two decimals", () => {
    expect(trainerRateSchema.safeParse({ ...row, percent: 22.55 }).success).toBe(false);
  });

  it("still reads the tombstone null", () => {
    expect(trainerRateSchema.parse({ ...row, percent: null }).percent).toBeNull();
  });
});
