/**
 * SessionCard rendering contract.
 *
 * Pins the editorial-slot layout decisions that survived the redesign
 * rounds: the booked/capacity fraction (with its zero-capacity and
 * over-booked edge cases), the inline SKRIVENO overline after the room
 * (not a right-side badge), and the absence of the legacy "X spots" copy.
 * Class-name pins from the old static tests (pl-[78px]) don't transfer —
 * classes are inert here — but those were redesign-era scaffolding, not
 * behavior.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { SessionCard } from "@/components/ui/session-card";

function renderCard(props: Partial<React.ComponentProps<typeof SessionCard>> = {}) {
  const defaults: React.ComponentProps<typeof SessionCard> = {
    time: "10:00 - 11:00",
    className: "Reformer pilates",
    trainerName: "Trainer Reformer Lead",
    room: "Sala 1",
    bookedCount: 5,
    capacity: 10,
    status: "available",
    sessionId: "s1",
  };
  return render(<SessionCard {...defaults} {...props} />);
}

describe("SessionCard", () => {
  it("renders class, trainer, and room together", () => {
    const screen = renderCard();
    expect(screen.getByText("Reformer pilates")).toBeTruthy();
    expect(screen.getByText("Trainer Reformer Lead")).toBeTruthy();
    expect(screen.getByText("Sala 1")).toBeTruthy();
    expect(screen.queryByText(/\b\d+\s+spots?\b/i)).toBeNull();
  });

  it("renders capacity as a booked/capacity fraction", () => {
    const screen = renderCard({ bookedCount: 5, capacity: 10, sessionId: "s1" });
    expect(screen.getByTestId("session-card-capacity-s1").textContent).toBe(
      "5 / 10",
    );
  });

  it.each([
    [7, 7, "full", "7 / 7"],
    [9, 7, "over", "9 / 7"],
    [0, 8, "empty", "0 / 8"],
  ])(
    "renders the raw fraction for booked=%i capacity=%i",
    (bookedCount, capacity, sessionId, expected) => {
      const screen = renderCard({ bookedCount, capacity, sessionId });
      expect(
        screen.getByTestId(`session-card-capacity-${sessionId}`).textContent,
      ).toBe(expected);
    },
  );

  it("renders no capacity fraction when capacity is 0", () => {
    const screen = renderCard({ bookedCount: 0, capacity: 0, sessionId: "noop" });
    expect(screen.queryByTestId("session-card-capacity-noop")).toBeNull();
  });

  it("falls back to the unsuffixed capacity testID without a sessionId", () => {
    const screen = renderCard({ bookedCount: 1, capacity: 2, sessionId: undefined });
    expect(screen.getByTestId("session-card-capacity").textContent).toBe("1 / 2");
  });

  it("renders the hidden overline inline after the room, not as a side badge", () => {
    const screen = renderCard({ hidden: true, hiddenLabel: "SKRIVENO" });
    const room = screen.getByText("Sala 1");
    const hiddenLabel = screen.getByText("SKRIVENO");
    // DOCUMENT_POSITION_FOLLOWING: the overline comes after the room in the
    // middle column's flow.
    expect(
      room.compareDocumentPosition(hiddenLabel) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders the time block at 22pt", () => {
    const screen = renderCard({ time: "10:00 - 11:00" });
    const time = screen.getByText(/10:00/);
    expect(getComputedStyle(time).fontSize).toBe("22px");
  });
});
