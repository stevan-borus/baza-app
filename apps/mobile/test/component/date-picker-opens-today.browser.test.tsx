/**
 * Shared DateTimePicker — "the calendar should already be on today"
 * (studio feedback: "kalendar bi mogao da bude automatski podešen na današnji
 * datum").
 *
 * The rule is about where the calendar OPENS, not what the closed field shows:
 * an unset field still reads as its placeholder, because pre-filling every
 * optional date with today would submit dates nobody picked. This pins that an
 * unset picker lands on the current month with today marked, and that a picker
 * WITH a value opens on that value's month instead.
 */
import { describe, it, expect } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import React from "react";
import "@/lib/i18n";
import { renderWithQueryClient } from "./helpers";
import { DateTimePicker } from "@/components/ui/date-time-picker";

async function openCalendar() {
  fireEvent.click(screen.getByTestId("picker"));
  await waitFor(() =>
    expect(screen.getByTestId("date-time-picker-calendar")).toBeTruthy(),
  );
}

/** The year the calendar is currently paged to, read off its caption. */
function displayedYear(): number {
  const caption = document.querySelector(".rdp-month_caption")?.textContent;
  const year = caption?.match(/\d{4}/)?.[0];
  expect(year, `caption ${caption} should carry a year`).toBeTruthy();
  return Number(year);
}

describe("DateTimePicker default month", () => {
  it("opens on the current month, with today marked, when no date is set", async () => {
    renderWithQueryClient(
      <DateTimePicker
        testID="picker"
        mode="date"
        value={null}
        onChange={() => {}}
        placeholder="Datum"
      />,
    );
    await openCalendar();
    expect(displayedYear()).toBe(new Date().getFullYear());
    // Today is offered as a selectable cell, not paged away from.
    const today = document.querySelector(".rdp-today");
    expect(today).toBeTruthy();
    expect(today?.closest(".rdp-outside")).toBeNull();
  });

  it("keeps the placeholder on the closed field rather than pre-filling today", () => {
    renderWithQueryClient(
      <DateTimePicker
        testID="picker"
        mode="date"
        value={null}
        onChange={() => {}}
        placeholder="Datum"
      />,
    );
    expect(screen.getByText("Datum")).toBeTruthy();
  });

  it("opens on the selected date's month when a value is already set", async () => {
    // A month far from today, so "current month" and "value's month" differ.
    const value = new Date(2020, 5, 15);
    renderWithQueryClient(
      <DateTimePicker
        testID="picker"
        mode="date"
        value={value}
        onChange={() => {}}
        placeholder="Datum"
      />,
    );
    await openCalendar();
    expect(displayedYear()).toBe(2020);
    expect(document.querySelector(".rdp-selected")).toBeTruthy();
  });

  it("re-reads the value's month on every open, not just the first", async () => {
    // The sheet stays mounted between opens, so a month resolved once at mount
    // would strand the second open on the first value's month.
    function Harness() {
      const [value, setValue] = React.useState<Date | null>(
        new Date(2020, 5, 15),
      );
      return (
        <>
          <DateTimePicker
            testID="picker"
            mode="date"
            value={value}
            onChange={() => {}}
            placeholder="Datum"
          />
          <button
            type="button"
            data-testid="set-2015"
            onClick={() => setValue(new Date(2015, 2, 10))}
          />
        </>
      );
    }
    renderWithQueryClient(<Harness />);

    await openCalendar();
    expect(displayedYear()).toBe(2020);
    fireEvent.click(screen.getByTestId("date-time-picker-cancel"));
    await waitFor(() =>
      expect(screen.queryByTestId("date-time-picker-calendar")).toBeNull(),
    );

    fireEvent.click(screen.getByTestId("set-2015"));
    await openCalendar();
    expect(displayedYear()).toBe(2015);
  });
});
