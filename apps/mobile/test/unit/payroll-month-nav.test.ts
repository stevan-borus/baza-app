import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  defaultPayrollMonth,
  formatMonthLabel,
  isFutureMonth,
  stepMonth,
} from "@/lib/payroll-month-nav";

describe("stepMonth", () => {
  it("steps back across a year boundary", () => {
    expect(stepMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });

  it("steps forward across a year boundary", () => {
    expect(stepMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
  });

  it("steps within a year", () => {
    expect(stepMonth({ year: 2026, month: 7 }, -1)).toEqual({ year: 2026, month: 6 });
  });

  it("handles a multi-month jump backwards", () => {
    expect(stepMonth({ year: 2026, month: 2 }, -14)).toEqual({ year: 2024, month: 12 });
  });
});

describe("defaultPayrollMonth", () => {
  beforeEach(() => {
    process.env.TEST_ANCHOR_TIME = "2026-08-10T12:00:00.000Z";
  });
  afterEach(() => {
    delete process.env.TEST_ANCHOR_TIME;
  });

  // Opening on LAST month made every payroll screen land on a month that is
  // over, so a studio checking "what have we run up so far" saw zeros and
  // had to step forward to find the month they are actually in. The running
  // month is the one being asked about; last month is one tap back.
  it("opens on the current month, the one being accrued", () => {
    expect(defaultPayrollMonth()).toEqual({ year: 2026, month: 8 });
  });

  it("stays inside the current month in January, with no year rollback", () => {
    process.env.TEST_ANCHOR_TIME = "2026-01-05T12:00:00.000Z";
    expect(defaultPayrollMonth()).toEqual({ year: 2026, month: 1 });
  });
});

describe("isFutureMonth", () => {
  beforeEach(() => {
    process.env.TEST_ANCHOR_TIME = "2026-08-10T12:00:00.000Z";
  });
  afterEach(() => {
    delete process.env.TEST_ANCHOR_TIME;
  });

  it("treats the current month as not future, so it can be inspected mid-month", () => {
    expect(isFutureMonth({ year: 2026, month: 8 })).toBe(false);
  });

  it("flags a later month", () => {
    expect(isFutureMonth({ year: 2026, month: 9 })).toBe(true);
    expect(isFutureMonth({ year: 2027, month: 1 })).toBe(true);
  });

  it("does not flag past months", () => {
    expect(isFutureMonth({ year: 2026, month: 7 })).toBe(false);
  });
});

describe("formatMonthLabel", () => {
  it("names the month in the active locale", () => {
    expect(formatMonthLabel({ year: 2026, month: 7 }, "en")).toBe("July 2026");
  });

  it("uses the month name without drifting a day across timezones", () => {
    // Anchoring mid-month keeps the label off the boundary where a UTC/local
    // shift would name the neighbouring month.
    expect(formatMonthLabel({ year: 2026, month: 1 }, "en")).toBe("January 2026");
    expect(formatMonthLabel({ year: 2026, month: 12 }, "en")).toBe("December 2026");
  });
});
