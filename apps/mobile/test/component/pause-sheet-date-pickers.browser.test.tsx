/**
 * Pause-package sheet — date entry (Vitest Browser Mode, real Chromium, real
 * RNW, real i18n with the shipped Serbian copy).
 *
 * The studio reported two problems with this sheet: the fields at the bottom
 * were hidden behind the software keyboard, and the start/end dates had to be
 * typed by hand. Both are the same fix — the two date fields are calendar
 * pickers now, so no keyboard opens for them at all.
 *
 * This pins: the pickers render (not text inputs), the calendar opens on
 * today when nothing is picked, the end picker cannot go before the start,
 * and the submitted payload is a well-formed ISO date the server accepts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import React from "react";
import "@/lib/i18n";
import { renderWithQueryClient } from "./helpers";

const apiRequestMock = vi.fn(
  async (_path: string, _opts?: Record<string, unknown>) => ({
    success: true,
    pause: {
      id: "pause-1",
      clientProfileId: "profile-1",
      startsAt: new Date().toISOString(),
      endsAt: new Date().toISOString(),
      reason: null,
    },
  }),
);
vi.mock("@/lib/api-request", () => ({
  apiRequest: (path: string, opts?: Record<string, unknown>) =>
    apiRequestMock(path, opts),
}));

import { PauseSheet } from "@/components/admin/client-flows/pause-sheet";

function renderSheet() {
  return renderWithQueryClient(
    <PauseSheet clientProfileId="profile-1" onClose={() => {}} />,
  );
}

/** The day cell for `date` inside the currently open react-day-picker. */
function dayCell(date: Date) {
  const label = String(date.getDate());
  const cells = Array.from(
    document.querySelectorAll("button.rdp-day_button"),
  ) as HTMLElement[];
  return cells.find(
    (c) =>
      c.textContent?.trim() === label &&
      !c.closest(".rdp-outside") &&
      !(c as HTMLButtonElement).disabled,
  );
}

async function pick(pickerTestId: string, date: Date) {
  fireEvent.click(screen.getByTestId(pickerTestId));
  await waitFor(() =>
    expect(screen.getByTestId("date-time-picker-calendar")).toBeTruthy(),
  );
  const cell = dayCell(date);
  expect(cell, `day ${date.getDate()} should be selectable`).toBeTruthy();
  fireEvent.click(cell!);
  fireEvent.click(screen.getByTestId("date-time-picker-confirm"));
  await waitFor(() =>
    expect(screen.queryByTestId("date-time-picker-calendar")).toBeNull(),
  );
}

describe("pause sheet date pickers", () => {
  beforeEach(() => {
    apiRequestMock.mockClear();
  });

  it("renders the start and end dates as pickers, not typed text inputs", () => {
    renderSheet();
    // A picker is a button, not a text field — so no keyboard is ever raised
    // for these two fields.
    for (const id of ["pause-start-input", "pause-end-input"]) {
      const el = screen.getByTestId(id);
      expect(el.tagName.toLowerCase()).not.toBe("input");
      expect(el.tagName.toLowerCase()).not.toBe("textarea");
    }
  });

  it("opens the calendar on the current month when no date is picked yet", async () => {
    renderSheet();
    fireEvent.click(screen.getByTestId("pause-start-input"));
    await waitFor(() =>
      expect(screen.getByTestId("date-time-picker-calendar")).toBeTruthy(),
    );
    // react-day-picker marks the current day with `.rdp-today`, which is only
    // rendered when the displayed month is the month containing today.
    expect(document.querySelector(".rdp-today")).toBeTruthy();
  });

  it("submits ISO dates the server can parse, and blocks an end before the start", async () => {
    renderSheet();

    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() + 1);
    const end = new Date(today);
    end.setDate(end.getDate() + 2);
    // Keep the window inside the current month so a single calendar page
    // holds both days — no month paging in the assertion path.
    if (end.getMonth() !== today.getMonth()) {
      start.setDate(1);
      end.setDate(2);
      start.setMonth(today.getMonth());
      end.setMonth(today.getMonth());
    }

    await pick("pause-start-input", start);

    // The end picker refuses anything before the chosen start: the day before
    // the start is rendered disabled.
    fireEvent.click(screen.getByTestId("pause-end-input"));
    await waitFor(() =>
      expect(screen.getByTestId("date-time-picker-calendar")).toBeTruthy(),
    );
    const before = new Date(start);
    before.setDate(before.getDate() - 1);
    const beforeCell = Array.from(
      document.querySelectorAll("button.rdp-day_button"),
    ).find(
      (c) =>
        c.textContent?.trim() === String(before.getDate()) &&
        !c.closest(".rdp-outside"),
    ) as HTMLButtonElement | undefined;
    expect(beforeCell?.disabled).toBe(true);
    fireEvent.click(screen.getByTestId("date-time-picker-cancel"));
    await waitFor(() =>
      expect(screen.queryByTestId("date-time-picker-calendar")).toBeNull(),
    );

    await pick("pause-end-input", end);

    fireEvent.click(screen.getByTestId("pause-submit-button"));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalled());
    const [, opts] = apiRequestMock.mock.calls[0]!;
    const body = (opts as { body: Record<string, string> }).body;
    // A real instant, not a hand-typed string: the server does `new Date(...)`
    // and 400s on NaN.
    expect(Number.isNaN(new Date(body.startsAt).getTime())).toBe(false);
    expect(Number.isNaN(new Date(body.endsAt).getTime())).toBe(false);
    expect(new Date(body.endsAt).getTime()).toBeGreaterThan(
      new Date(body.startsAt).getTime(),
    );
  });
});
