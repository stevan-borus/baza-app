/**
 * trialSessionValue is REQUIRED on create and can never be cleared to null.
 *
 * An unvalued class type silently drops confirmed trial attendances out of the
 * trainer payout, so the input schema refuses both the omission and an
 * explicit null. The DB column stays nullable for legacy rows awaiting a
 * backfill — which is why the RESPONSE schema keeps `.nullable()` and this
 * test pins the asymmetry rather than assuming it away.
 */
import { describe, expect, it } from "vitest";
import {
  classTypeInputSchema,
  classTypeSchema,
  updateClassTypeInputSchema,
} from "@baza/types/catalog";

const VALID_CREATE = {
  name: "Probni Reformer",
  maxClients: 6,
  durationMins: 60,
  trialSessionValue: 2500,
};

describe("classTypeInputSchema — trialSessionValue is required", () => {
  it("accepts a positive integer", () => {
    expect(classTypeInputSchema.parse(VALID_CREATE).trialSessionValue).toBe(2500);
  });

  it("rejects an omitted trialSessionValue", () => {
    const { trialSessionValue: _omitted, ...withoutValue } = VALID_CREATE;
    expect(classTypeInputSchema.safeParse(withoutValue).success).toBe(false);
  });

  it("rejects an explicitly null trialSessionValue", () => {
    expect(
      classTypeInputSchema.safeParse({ ...VALID_CREATE, trialSessionValue: null })
        .success,
    ).toBe(false);
  });

  it.each([0, -100, 12.5])("rejects %s", (value) => {
    expect(
      classTypeInputSchema.safeParse({ ...VALID_CREATE, trialSessionValue: value })
        .success,
    ).toBe(false);
  });
});

describe("updateClassTypeInputSchema — omit is fine, null is not", () => {
  it("accepts a PATCH that omits trialSessionValue entirely", () => {
    const parsed = updateClassTypeInputSchema.safeParse({ name: "Preimenovan" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && "trialSessionValue" in parsed.data).toBe(false);
  });

  it("accepts a PATCH raising trialSessionValue to another positive value", () => {
    const parsed = updateClassTypeInputSchema.safeParse({ trialSessionValue: 3000 });
    expect(parsed.success && parsed.data.trialSessionValue).toBe(3000);
  });

  it("rejects a PATCH clearing trialSessionValue to null", () => {
    expect(
      updateClassTypeInputSchema.safeParse({ trialSessionValue: null }).success,
    ).toBe(false);
  });
});

describe("classTypeSchema — the response side stays nullable", () => {
  it("still parses a legacy row whose trialSessionValue is null", () => {
    const parsed = classTypeSchema.safeParse({
      id: "ct-legacy",
      name: "Reformer pilates",
      maxClients: 6,
      durationMins: 60,
      trialSessionValue: null,
    });
    expect(parsed.success).toBe(true);
  });
});
