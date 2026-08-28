/**
 * Week-strip boundary tests — Vitest Browser Mode (real Chromium, real
 * react-native-web rendering).
 *
 * The client home strip sits under an "OVA NEDELJA" heading, so it has to be
 * a real calendar week: Monday through Sunday, containing today. It used to
 * render a rolling window (today plus six days forward), which on a Friday
 * read Fri→Thu and made the heading a lie.
 *
 * The strip itself stays a dumb 7-day renderer — the boundary is the
 * caller's, via `startOfMondayWeek`. These tests pin both halves: that the
 * component renders exactly the seven days from `weekStart`, and that
 * `startOfMondayWeek` hands it a Monday in either language.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import dayjs from "dayjs";
import "dayjs/locale/sr";
import "dayjs/locale/en";
import "@/lib/i18n";
import { StudioWeekStrip } from "@/components/ui/studio";
import { startOfMondayWeek } from "@/lib/use-week-navigation";

const noop = () => {};

/** The pill testIDs, in render order — `week-strip-day-YYYY-MM-DD`. */
function renderedDayKeys(container: HTMLElement): string[] {
  return Array.from(
    container.querySelectorAll('[data-testid^="week-strip-day-"]'),
  ).map((el) => el.getAttribute("data-testid")!.replace("week-strip-day-", ""));
}

/** Every day of the week of Mon 2026-06-08 … Sun 2026-06-14. */
const MONDAY_WEEK = [
  "2026-06-08",
  "2026-06-09",
  "2026-06-10",
  "2026-06-11",
  "2026-06-12",
  "2026-06-13",
  "2026-06-14",
];

function renderStrip(today: string) {
  const selected = dayjs(today);
  return render(
    <StudioWeekStrip
      weekStart={startOfMondayWeek(selected)}
      selected={selected}
      onSelect={noop}
      sessionsByDay={{}}
    />,
  );
}

describe("client home week strip", () => {
  it("renders Monday→Sunday when today is a Friday", () => {
    // The reported bug: a Friday used to render Fri→Thu.
    const screen = renderStrip("2026-06-12");
    expect(renderedDayKeys(screen.container)).toEqual(MONDAY_WEEK);
  });

  it("renders the same week when today is the Monday", () => {
    const screen = renderStrip("2026-06-08");
    expect(renderedDayKeys(screen.container)).toEqual(MONDAY_WEEK);
  });

  it("renders the week BEHIND a Sunday, not the one starting after it", () => {
    const screen = renderStrip("2026-06-14");
    expect(renderedDayKeys(screen.container)).toEqual(MONDAY_WEEK);
  });

  it("spans a month boundary in one strip", () => {
    // Wed 2026-07-01 belongs to the week of Mon 2026-06-29.
    const screen = renderStrip("2026-07-01");
    expect(renderedDayKeys(screen.container)).toEqual([
      "2026-06-29",
      "2026-06-30",
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
      "2026-07-04",
      "2026-07-05",
    ]);
  });

  it("starts on Monday under the en locale too", () => {
    const previous = dayjs.locale();
    try {
      dayjs.locale("en");
      const screen = renderStrip("2026-06-12");
      expect(renderedDayKeys(screen.container)).toEqual(MONDAY_WEEK);
    } finally {
      dayjs.locale(previous);
    }
  });

  it("keeps the selected day inside the rendered week, so its pill can highlight", () => {
    const screen = renderStrip("2026-06-12");
    const keys = renderedDayKeys(screen.container);
    expect(keys).toContain("2026-06-12");
    // The pill the e2e helper `navigateWeekStripTo` clicks by testID.
    expect(
      screen.container.querySelector(
        '[data-testid="week-strip-day-2026-06-12"]',
      ),
    ).toBeTruthy();
  });
});
