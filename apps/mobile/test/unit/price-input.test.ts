/**
 * Price input validation for the package-type form.
 *
 * Bug under test: the optional price field fed raw text into parseInt —
 * "abc" → NaN → JSON.stringify drops the key → the API silently saved the
 * package type with NO price. The field must reject non-numeric/negative
 * input client-side (like sessionCount/validityDays gate the submit button)
 * instead of silently nulling.
 */
import { describe, expect, it } from "vitest";
import { isPriceInputValid, parsePriceInput } from "@/lib/price-input";

describe("isPriceInputValid", () => {
  it("accepts empty input — price is optional", () => {
    expect(isPriceInputValid("")).toBe(true);
    expect(isPriceInputValid("   ")).toBe(true);
  });

  it("accepts whole non-negative dinar amounts", () => {
    expect(isPriceInputValid("0")).toBe(true);
    expect(isPriceInputValid("24000")).toBe(true);
    expect(isPriceInputValid(" 24000 ")).toBe(true);
  });

  it("rejects non-numeric text", () => {
    expect(isPriceInputValid("abc")).toBe(false);
    expect(isPriceInputValid("24k")).toBe(false);
    expect(isPriceInputValid("24 000")).toBe(false);
  });

  it("rejects negative and fractional amounts", () => {
    expect(isPriceInputValid("-5")).toBe(false);
    expect(isPriceInputValid("24.5")).toBe(false);
    expect(isPriceInputValid("24,5")).toBe(false);
  });

  it("rejects exponent notation parseInt would mangle", () => {
    expect(isPriceInputValid("1e3")).toBe(false);
  });
});

describe("parsePriceInput", () => {
  it("maps empty input to null (no price)", () => {
    expect(parsePriceInput("")).toBeNull();
    expect(parsePriceInput("  ")).toBeNull();
  });

  it("parses valid input to a whole number", () => {
    expect(parsePriceInput("24000")).toBe(24000);
    expect(parsePriceInput(" 0 ")).toBe(0);
  });
});
