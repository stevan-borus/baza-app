/**
 * Edit-pause sheet — Vitest Browser Mode (real Chromium, real RNW, real i18n
 * with the shipped Serbian copy).
 *
 * Both ends stay editable however far the pause has got: a client who says
 * they can come the first two days after all should be moved forward in
 * place, not ended and recreated. The server re-grants the extension from the
 * new window, so the sheet just sends whatever the admin picked.
 *
 * The 409 branch is the other readable failure: two pauses overlapping. It
 * reuses the create-sheet's copy because it is the same collision.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import React from "react";
import "@/lib/i18n";
import { renderWithQueryClient } from "./helpers";
import { ApiError } from "@/lib/api-error";

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

import { EditPauseSheet } from "@/components/admin/client-flows/edit-pause-sheet";

const DAY = 24 * 60 * 60 * 1000;

function makePause(overrides: Partial<{
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
}> = {}) {
  return {
    id: "pause-1",
    startsAt: new Date(Date.now() - DAY).toISOString(),
    endsAt: new Date(Date.now() + 10 * DAY).toISOString(),
    reason: "Putovanje",
    ...overrides,
  };
}

function renderSheet(
  pause = makePause(),
  onClose: () => void = () => {},
) {
  return renderWithQueryClient(
    <EditPauseSheet pause={pause} onClose={onClose} />,
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

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue({
    success: true,
    pause: {
      id: "pause-1",
      clientProfileId: "profile-1",
      startsAt: new Date().toISOString(),
      endsAt: new Date().toISOString(),
      reason: null,
    },
  });
});

describe("EditPauseSheet", () => {
  it("renders nothing until a pause is handed to it", () => {
    const s = renderWithQueryClient(
      <EditPauseSheet pause={null} onClose={() => {}} />,
    );
    expect(s.queryByTestId("edit-pause-submit-button")).toBeNull();
  });

  it("seeds the form from the pause it was given", () => {
    const s = renderSheet();
    const reason = s.getByTestId("edit-pause-reason-input") as HTMLInputElement;
    expect(reason.value).toBe("Putovanje");
  });

  it("sends the moved start on a pause that is already running", async () => {
    // Keep every picked day inside one calendar page so no month paging runs.
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() + 2);
    if (start.getMonth() !== today.getMonth()) start.setMonth(today.getMonth(), 2);

    const s = renderSheet(
      makePause({
        startsAt: new Date(Date.now() - 2 * DAY).toISOString(),
        endsAt: new Date(Date.now() + 20 * DAY).toISOString(),
      }),
    );

    await pick("edit-pause-start-input", start);
    fireEvent.click(s.getByTestId("edit-pause-submit-button"));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledTimes(1));
    const opts = apiRequestMock.mock.calls[0][1] as {
      body: { startsAt: string };
    };
    expect(new Date(opts.body.startsAt).getDate()).toBe(start.getDate());
  });

  it("warns that reservations in the NEW window get canceled", () => {
    const s = renderSheet();
    expect(s.getByTestId("edit-pause-consequences-hint").textContent).toContain(
      "novom periodu",
    );
  });

  it("PATCHes the pause with ISO dates, sending null for a cleared reason", async () => {
    const onClose = vi.fn();
    const s = renderSheet(makePause(), onClose);

    fireEvent.change(s.getByTestId("edit-pause-reason-input"), {
      target: { value: "   " },
    });
    fireEvent.click(s.getByTestId("edit-pause-submit-button"));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledTimes(1));
    expect(apiRequestMock.mock.calls[0][0]).toBe("/api/packages/pauses/pause-1");
    const opts = apiRequestMock.mock.calls[0][1] as {
      method: string;
      body: { startsAt: string; endsAt: string; reason: string | null };
    };
    expect(opts.method).toBe("PATCH");
    expect(Number.isNaN(new Date(opts.body.startsAt).getTime())).toBe(false);
    expect(Number.isNaN(new Date(opts.body.endsAt).getTime())).toBe(false);
    expect(opts.body.reason).toBeNull();

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("sends the edited end date the admin picked", async () => {
    // Keep both days inside one calendar page so no month paging is needed.
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() + 1);
    const end = new Date(today);
    end.setDate(end.getDate() + 3);
    if (end.getMonth() !== today.getMonth()) {
      start.setMonth(today.getMonth(), 1);
      end.setMonth(today.getMonth(), 3);
    }

    const s = renderSheet(
      makePause({
        startsAt: start.toISOString(),
        endsAt: new Date(start.getTime() + 2 * DAY).toISOString(),
      }),
    );

    await pick("edit-pause-end-input", end);
    fireEvent.click(s.getByTestId("edit-pause-submit-button"));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledTimes(1));
    const opts = apiRequestMock.mock.calls[0][1] as {
      body: { endsAt: string };
    };
    expect(new Date(opts.body.endsAt).getDate()).toBe(end.getDate());
  });

  it("lets a running pause's start move BACKWARD to correct a wrong date", async () => {
    // "I was away from the 1st, not the 2nd" — the admin corrects the start
    // rather than ending the pause and creating a replacement. Keep every day
    // inside one calendar page so no month paging runs.
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 2);
    const earlier = new Date(today);
    earlier.setDate(earlier.getDate() - 4);
    if (earlier.getMonth() !== today.getMonth()) {
      start.setMonth(today.getMonth(), 6);
      earlier.setMonth(today.getMonth(), 4);
    }

    const s = renderSheet(
      makePause({
        startsAt: start.toISOString(),
        endsAt: new Date(Date.now() + 20 * DAY).toISOString(),
      }),
    );

    await pick("edit-pause-start-input", earlier);
    fireEvent.click(s.getByTestId("edit-pause-submit-button"));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledTimes(1));
    const opts = apiRequestMock.mock.calls[0][1] as {
      body: { startsAt: string };
    };
    expect(new Date(opts.body.startsAt).getDate()).toBe(earlier.getDate());
  });

  it("a 409 says the windows collide instead of the generic failure", async () => {
    apiRequestMock.mockRejectedValue(
      new ApiError(409, { error: "overlaps" }, "fallback"),
    );
    const s = renderSheet();

    fireEvent.click(s.getByTestId("edit-pause-submit-button"));

    await waitFor(() =>
      expect(
        s.getByText(
          "Klijent već ima pauzu u tom periodu. Izaberi drugi datum.",
        ),
      ).toBeTruthy(),
    );
  });

  it("any other failure shows the generic edit error and keeps the form up", async () => {
    apiRequestMock.mockRejectedValue(new Error("network down"));
    const onClose = vi.fn();
    const s = renderSheet(makePause(), onClose);

    fireEvent.click(s.getByTestId("edit-pause-submit-button"));

    await waitFor(() =>
      expect(
        s.getByText("Izmena pauze nije uspela. Pokušaj ponovo."),
      ).toBeTruthy(),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(s.getByTestId("edit-pause-submit-button")).toBeTruthy();
  });
});
