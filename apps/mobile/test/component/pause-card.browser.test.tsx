/**
 * PauseCard on the admin client-detail Pregled tab — Vitest Browser Mode
 * (real Chromium, real RNW, real i18n with the shipped Serbian copy).
 *
 * A pause used to be a chip in the header saying "Pauziran" plus a bare text
 * link. That told the admin a pause exists but not which window it covers,
 * why, or that a pause booked for next month exists at all. The card is the
 * fix: it names the window, the reason, and offers edit + end in one block.
 *
 * The two kinds are NOT the same action wearing one label. Ending a RUNNING
 * pause closes it today and pulls expiry back; "ending" a pause that has not
 * started DELETES it. Same endpoint, different consequence, so the copy has
 * to differ — that split is what these tests pin.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent } from "@testing-library/react";
import React from "react";
import "@/lib/i18n";
import { renderWithQueryClient } from "./helpers";

const apiRequestMock = vi.fn(
  async (_path: string, _opts?: Record<string, unknown>) => ({ success: true }),
);
vi.mock("@/lib/api-request", () => ({
  apiRequest: (path: string, opts?: Record<string, unknown>) =>
    apiRequestMock(path, opts),
}));

import { PauseCard } from "@/components/admin/client-detail/PauseCard";

const ACTIVE_PAUSE = {
  id: "pause-1",
  startsAt: new Date(Date.UTC(2026, 2, 10, 12)).toISOString(),
  endsAt: new Date(Date.UTC(2026, 2, 25, 12)).toISOString(),
  reason: "Putovanje",
};

const UPCOMING_PAUSE = {
  id: "pause-2",
  startsAt: new Date(Date.UTC(2026, 5, 1, 12)).toISOString(),
  endsAt: new Date(Date.UTC(2026, 5, 15, 12)).toISOString(),
  reason: null,
};

function renderCard(
  pause: { id: string; startsAt: string; endsAt: string; reason: string | null },
  kind: "active" | "upcoming",
  onEditPause: (
    p: { id: string; startsAt: string; endsAt: string; reason: string | null },
    k: "active" | "upcoming",
  ) => void = () => {},
) {
  return renderWithQueryClient(
    <PauseCard pause={pause} kind={kind} lang="sr" onEditPause={onEditPause} />,
  );
}

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue({ success: true });
});

describe("PauseCard", () => {
  it("labels a running pause 'Pauza' and prints the window as the admin entered it", () => {
    const screen = renderCard(ACTIVE_PAUSE, "active");
    expect(screen.container.textContent).toContain("Pauza");
    const range = screen.getByTestId("client-pause-range").textContent ?? "";
    expect(range).toContain("10.3.2026.");
    // endsAt is the day the client is back — shown exactly as entered, not
    // converted to an inclusive last-paused day.
    expect(range).toContain("25.3.2026.");
  });

  it("shows the reason the admin typed", () => {
    const screen = renderCard(ACTIVE_PAUSE, "active");
    expect(screen.getByTestId("client-pause-reason").textContent).toContain(
      "Putovanje",
    );
  });

  it("omits the reason line entirely when there is no reason", () => {
    const screen = renderCard(
      { ...ACTIVE_PAUSE, reason: null },
      "active",
    );
    expect(screen.queryByTestId("client-pause-reason")).toBeNull();
  });

  it("omits the reason line when the reason is blank whitespace", () => {
    const screen = renderCard({ ...ACTIVE_PAUSE, reason: "   " }, "active");
    expect(screen.queryByTestId("client-pause-reason")).toBeNull();
  });

  it("labels a pause that has not started 'Zakazana pauza'", () => {
    const screen = renderCard(UPCOMING_PAUSE, "upcoming");
    expect(screen.container.textContent).toContain("Zakazana pauza");
  });

  it("offers 'Prekini pauzu' on a running pause", () => {
    const screen = renderCard(ACTIVE_PAUSE, "active");
    expect(screen.getByTestId("client-end-pause-button").textContent).toContain(
      "Prekini pauzu",
    );
  });

  it("offers 'Otkaži pauzu' on a pause that has not started — the endpoint deletes it", () => {
    const screen = renderCard(UPCOMING_PAUSE, "upcoming");
    expect(screen.getByTestId("client-end-pause-button").textContent).toContain(
      "Otkaži pauzu",
    );
  });

  it("the upcoming confirm says the pause is removed and validity reverts", () => {
    const screen = renderCard(UPCOMING_PAUSE, "upcoming");
    fireEvent.click(screen.getByTestId("client-end-pause-button"));

    const sheet = screen.container.textContent ?? "";
    expect(sheet).toContain("Otkaži zakazanu pauzu?");
    expect(sheet).toContain("briše pre nego što je počela");
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("the active confirm keeps the shortened-expiry warning", () => {
    const screen = renderCard(ACTIVE_PAUSE, "active");
    fireEvent.click(screen.getByTestId("client-end-pause-button"));

    const sheet = screen.container.textContent ?? "";
    expect(sheet).toContain("Prekini pauzu?");
    expect(sheet).toContain("skraćuje");
  });

  it("the edit action hands the pause and its kind back to the screen", () => {
    const onEditPause = vi.fn();
    const screen = renderCard(UPCOMING_PAUSE, "upcoming", onEditPause);

    const edit = screen.getByTestId("client-edit-pause-button");
    expect(edit.textContent).toContain("Izmeni pauzu");
    fireEvent.click(edit);

    expect(onEditPause).toHaveBeenCalledTimes(1);
    expect(onEditPause).toHaveBeenCalledWith(UPCOMING_PAUSE, "upcoming");
  });

  it("edit does not fire the end-pause endpoint", () => {
    const screen = renderCard(ACTIVE_PAUSE, "active");
    fireEvent.click(screen.getByTestId("client-edit-pause-button"));
    expect(apiRequestMock).not.toHaveBeenCalled();
  });
});
