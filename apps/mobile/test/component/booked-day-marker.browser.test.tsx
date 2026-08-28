/**
 * Booked-day marking on the week strip and the month grid.
 *
 * The studio asked to "obeležiti/obojiti dane korisniku u kalendaru za koje je
 * rezervisao već termin" — on BOTH the home/calendar week strip and the month
 * grid. The server already reports `isBookedByMe` per session; these surfaces
 * previously had ONE dot with ONE meaning ("this day has sessions").
 *
 * The booked treatment must be distinguishable by more than colour — the
 * studio's clients skew older, and colour-only encoding fails both low-vision
 * users and screen readers. So a booked day renders a FILLED RING (a larger
 * dot with a visible ring around it) rather than merely a differently-coloured
 * dot, and the day pill carries a localized accessibility label.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import dayjs from "dayjs";
import "dayjs/locale/sr";
import "@/lib/i18n";
import { StudioWeekStrip } from "@/components/ui/studio";
import { MonthView } from "@/components/ui/month-view";

const noop = () => {};

const MONDAY = "2026-06-08";
const HAS_SESSIONS = "2026-06-09";
const BOOKED = "2026-06-10";
const EMPTY_DAY = "2026-06-11";

function renderStrip(bookedByDay: Record<string, boolean> = {}) {
  return render(
    <StudioWeekStrip
      weekStart={dayjs(MONDAY)}
      selected={dayjs(MONDAY)}
      onSelect={noop}
      sessionsByDay={{ [HAS_SESSIONS]: 3, [BOOKED]: 2 }}
      bookedByDay={bookedByDay}
    />,
  );
}

function renderMonth(bookedDates: Record<string, boolean> = {}) {
  return render(
    <MonthView
      month={dayjs(MONDAY)}
      selectedDate={MONDAY}
      onSelectDate={noop}
      onPrevMonth={noop}
      onNextMonth={noop}
      activity={{ [HAS_SESSIONS]: 3, [BOOKED]: 2 }}
      bookedDates={bookedDates}
    />,
  );
}

function dayPill(container: HTMLElement, prefix: string, date: string) {
  return container.querySelector(`[data-testid="${prefix}-${date}"]`);
}

describe("StudioWeekStrip — booked-day marker", () => {
  it("marks a day the client booked with the booked indicator", () => {
    const screen = renderStrip({ [BOOKED]: true });
    expect(
      dayPill(screen.container, "week-strip-day", BOOKED)?.querySelector(
        '[data-testid="week-strip-booked-marker"]',
      ),
    ).toBeTruthy();
  });

  it("does NOT mark a day that merely has sessions", () => {
    const screen = renderStrip({ [BOOKED]: true });
    const pill = dayPill(screen.container, "week-strip-day", HAS_SESSIONS);
    expect(pill?.querySelector('[data-testid="week-strip-booked-marker"]')).toBeNull();
    // The has-sessions dot is still there — the two states coexist.
    expect(pill?.querySelector('[data-testid="week-strip-sessions-dot"]')).toBeTruthy();
  });

  it("marks neither on a day with no sessions and no booking", () => {
    const screen = renderStrip({ [BOOKED]: true });
    const pill = dayPill(screen.container, "week-strip-day", EMPTY_DAY);
    expect(pill?.querySelector('[data-testid="week-strip-booked-marker"]')).toBeNull();
    expect(pill?.querySelector('[data-testid="week-strip-sessions-dot"]')).toBeNull();
  });

  it("gives a booked day a localized accessibility label", () => {
    const screen = renderStrip({ [BOOKED]: true });
    const pill = dayPill(screen.container, "week-strip-day", BOOKED);
    // sr is the default locale.
    expect(pill?.getAttribute("aria-label")).toContain("Imate zakazan termin");
  });

  it("gives an unbooked day no booked-termin label", () => {
    const screen = renderStrip({ [BOOKED]: true });
    const pill = dayPill(screen.container, "week-strip-day", HAS_SESSIONS);
    expect(pill?.getAttribute("aria-label") ?? "").not.toContain(
      "Imate zakazan termin",
    );
  });

  it("marks nothing when no bookedByDay map is passed at all", () => {
    // Every existing caller (raspored, pregled, session-picker) omits the prop.
    const screen = render(
      <StudioWeekStrip
        weekStart={dayjs(MONDAY)}
        selected={dayjs(MONDAY)}
        onSelect={noop}
        sessionsByDay={{ [HAS_SESSIONS]: 3 }}
      />,
    );
    expect(
      screen.container.querySelector('[data-testid="week-strip-booked-marker"]'),
    ).toBeNull();
    // and the plain sessions dot still works
    expect(
      dayPill(screen.container, "week-strip-day", HAS_SESSIONS)?.querySelector(
        '[data-testid="week-strip-sessions-dot"]',
      ),
    ).toBeTruthy();
  });
});

describe("MonthView — booked-day marker", () => {
  it("marks a day the client booked", () => {
    const screen = renderMonth({ [BOOKED]: true });
    expect(
      dayPill(screen.container, "month-day", BOOKED)?.querySelector(
        '[data-testid="month-booked-marker"]',
      ),
    ).toBeTruthy();
  });

  it("does NOT mark a day that merely has sessions", () => {
    const screen = renderMonth({ [BOOKED]: true });
    const cell = dayPill(screen.container, "month-day", HAS_SESSIONS);
    expect(cell?.querySelector('[data-testid="month-booked-marker"]')).toBeNull();
    expect(cell?.querySelector('[data-testid="month-sessions-dot"]')).toBeTruthy();
  });

  it("marks neither on a day with no sessions and no booking", () => {
    const screen = renderMonth({ [BOOKED]: true });
    const cell = dayPill(screen.container, "month-day", EMPTY_DAY);
    expect(cell?.querySelector('[data-testid="month-booked-marker"]')).toBeNull();
    expect(cell?.querySelector('[data-testid="month-sessions-dot"]')).toBeNull();
  });

  it("appends the localized booked label to the day's accessibility label", () => {
    const screen = renderMonth({ [BOOKED]: true });
    const cell = dayPill(screen.container, "month-day", BOOKED);
    const label = cell?.getAttribute("aria-label") ?? "";
    // Keeps the existing full-date label AND adds the booking state.
    expect(label).toContain("Imate zakazan termin");
    expect(label.length).toBeGreaterThan("Imate zakazan termin".length);
  });

  it("marks nothing when no bookedDates map is passed", () => {
    const screen = renderMonth();
    expect(
      screen.container.querySelector('[data-testid="month-booked-marker"]'),
    ).toBeNull();
  });
});
