import { describe, expect, it } from "vitest";
import { formatDateOfBirth, parseDateOfBirth } from "@/lib/date-of-birth";

describe("parseDateOfBirth", () => {
  it("parses a valid YYYY-MM-DD string into a UTC-midnight Date", () => {
    const d = parseDateOfBirth("1990-05-14");
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe("1990-05-14T00:00:00.000Z");
  });

  it("returns null for an empty string", () => {
    expect(parseDateOfBirth("")).toBeNull();
  });

  it("returns null for an invalid date (e.g. Feb 30)", () => {
    expect(parseDateOfBirth("1990-02-30")).toBeNull();
  });

  it("returns null for malformed input", () => {
    expect(parseDateOfBirth("14/05/1990")).toBeNull();
    expect(parseDateOfBirth("not-a-date")).toBeNull();
  });

  it("rejects years before 1900 and after the current year", () => {
    expect(parseDateOfBirth("1899-12-31")).toBeNull();
    expect(parseDateOfBirth("3000-01-01")).toBeNull();
  });

  it("accepts a Feb 29 in a leap year", () => {
    const d = parseDateOfBirth("2000-02-29");
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe("2000-02-29T00:00:00.000Z");
  });
});

describe("formatDateOfBirth", () => {
  it("formats Serbian as dd.MM.yyyy.", () => {
    const d = new Date("1990-05-14T00:00:00.000Z");
    expect(formatDateOfBirth(d, "sr")).toBe("14.05.1990.");
  });

  it("formats English as 'May 14, 1990'", () => {
    const d = new Date("1990-05-14T00:00:00.000Z");
    expect(formatDateOfBirth(d, "en")).toBe("May 14, 1990");
  });

  it("returns an empty string for null", () => {
    expect(formatDateOfBirth(null, "sr")).toBe("");
    expect(formatDateOfBirth(null, "en")).toBe("");
  });
});
