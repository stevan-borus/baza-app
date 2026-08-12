/**
 * MonthStepper — the payroll month picker. Real Chromium + react-native-web +
 * the shipped Serbian i18n.
 *
 * Pins the two behaviours worth locking: the label names the right month, and
 * stepping into the future is blocked (there is no payroll to show for a month
 * that has not happened).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import React from "react";
import "@/lib/i18n";
import { MonthStepper } from "@/components/payroll/month-stepper";

describe("MonthStepper", () => {
  beforeEach(() => {
    process.env.TEST_ANCHOR_TIME = "2026-08-10T12:00:00.000Z";
  });
  afterEach(() => {
    delete process.env.TEST_ANCHOR_TIME;
  });

  it("names the selected month", () => {
    const screen = render(
      <MonthStepper cursor={{ year: 2026, month: 7 }} onChange={() => {}} />,
    );
    expect(screen.getByTestId("payroll-month-stepper-label").textContent).toContain(
      "2026",
    );
  });

  it("steps back a month", () => {
    const onChange = vi.fn();
    const screen = render(
      <MonthStepper cursor={{ year: 2026, month: 7 }} onChange={onChange} />,
    );
    fireEvent.click(screen.getByTestId("payroll-month-stepper-prev"));
    expect(onChange).toHaveBeenCalledWith({ year: 2026, month: 6 });
  });

  it("steps back across the year boundary", () => {
    const onChange = vi.fn();
    const screen = render(
      <MonthStepper cursor={{ year: 2026, month: 1 }} onChange={onChange} />,
    );
    fireEvent.click(screen.getByTestId("payroll-month-stepper-prev"));
    expect(onChange).toHaveBeenCalledWith({ year: 2025, month: 12 });
  });

  it("steps forward while the next month is not in the future", () => {
    const onChange = vi.fn();
    const screen = render(
      <MonthStepper cursor={{ year: 2026, month: 6 }} onChange={onChange} />,
    );
    fireEvent.click(screen.getByTestId("payroll-month-stepper-next"));
    expect(onChange).toHaveBeenCalledWith({ year: 2026, month: 7 });
  });

  it("blocks stepping past the current month", () => {
    const onChange = vi.fn();
    // Anchor is August 2026, so from August the next step would be September.
    const screen = render(
      <MonthStepper cursor={{ year: 2026, month: 8 }} onChange={onChange} />,
    );
    fireEvent.click(screen.getByTestId("payroll-month-stepper-next"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
