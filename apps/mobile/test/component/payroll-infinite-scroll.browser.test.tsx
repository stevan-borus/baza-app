/**
 * Honorari (admin) + Zarada (trainer) — the month's session list reveals more
 * rows by SCROLLING, not by pressing a button.
 *
 * A month endpoint hands back every session at once, so the page size here is
 * purely about how many cards are mounted. The old "Prikaži još (N)" button
 * made that internal budget the user's problem; these tests pin that the
 * button is gone and that reaching the bottom reveals the next page instead.
 *
 * Both screens are mounted for real (react-native-web + the shipped Serbian
 * i18n) with the payroll month cache seeded, so the assertions run the same
 * cache → hook → ScrollView path production does. Each mount gets a
 * phone-sized viewport: react-native-web derives `layoutMeasurement` from the
 * scroll container's real box, and an unbounded one reports the whole content
 * as visible — which is the "everything already fits" case, not scrolling.
 */
import { describe, it, expect } from "vitest";
import { waitFor } from "@testing-library/react";
import React from "react";
import { View } from "react-native";
import "@/lib/i18n";
import type { PayrollMonth } from "@baza/types/payroll";
import { payrollQueries } from "@/lib/queries/payroll-queries-factory";
import { renderWithQueryClient } from "./helpers";
import HonorariTrainerDetail from "@/app/(admin)/izvestaji/honorari/[trainerId]";
import TrainerZarada from "@/app/(trainer)/zarada";
import { defaultPayrollMonth } from "@/lib/payroll-month-nav";

const PAGE_SIZE = 30;
const TOTAL = 75;
const VIEWPORT_HEIGHT = 700;

function makeMonth(sessionCount: number): PayrollMonth {
  return {
    trainerUserId: "trainer-1",
    trainerName: "Ana Trener",
    periodStart: "2026-08-01T00:00:00.000Z",
    periodEnd: "2026-08-31T23:59:59.000Z",
    buckets: [
      {
        classTypeId: null,
        classTypeName: null,
        percent: 50,
        gross: sessionCount * 1000,
        payout: sessionCount * 500,
      },
    ],
    sessions: Array.from({ length: sessionCount }, (_, i) => ({
      sessionId: `s-${i}`,
      startsAt: `2026-08-${String((i % 28) + 1).padStart(2, "0")}T09:00:00.000Z`,
      classTypeName: `Čas ${i}`,
      attendees: [
        {
          bookingId: `b-${i}`,
          clientName: `Klijent ${i}`,
          packageName: "Paket 10",
          sessionValue: 1000,
          isGift: false,
        },
      ],
      gross: 1000,
      unpricedCount: 0,
    })),
    sessionCount,
    attendeeCount: sessionCount,
    gross: sessionCount * 1000,
    payout: sessionCount * 500,
    adjustmentTotal: 0,
    netPayout: sessionCount * 500,
    unpricedCount: 0,
    giftCount: 0,
    adjustments: [],
  };
}

/**
 * Both screens open on the same default month, and the admin screen has no
 * trainerId under the router stub — so seed exactly the key each one asks for
 * rather than guessing at it.
 */
function renderScreen(
  screen: React.ReactElement,
  sessionCount: number,
  viewportHeight = VIEWPORT_HEIGHT,
) {
  const cursor = defaultPayrollMonth();
  return renderWithQueryClient(
    <View style={{ height: viewportHeight }}>{screen}</View>,
    (client) => {
      client.setQueryData(payrollQueries.month(cursor).queryKey, {
        success: true,
        month: makeMonth(sessionCount),
      });
    },
  );
}

function countRows(container: HTMLElement, prefix: string) {
  return container.querySelectorAll(`[data-testid^="${prefix}"]`).length;
}

/**
 * Scroll the list to its end. react-native-web reads the scroll container's
 * own box on the DOM event, so setting scrollTop and dispatching produces the
 * same nativeEvent a real swipe would.
 */
function scrollToBottom(container: HTMLElement) {
  const scroller = container.querySelector<HTMLElement>(
    '[data-testid="payroll-session-scroll"]',
  );
  if (!scroller) throw new Error("no payroll scroll container found");
  scroller.scrollTop = scroller.scrollHeight;
  scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
}

describe("Honorari trainer detail — infinite scroll", () => {
  it("renders one page of sessions with no load-more button", async () => {
    const screen = renderScreen(<HonorariTrainerDetail />, TOTAL);

    await waitFor(() =>
      expect(countRows(screen.container, "honorari-session-")).toBe(PAGE_SIZE),
    );
    expect(screen.queryByTestId("honorari-load-more")).toBeNull();
    expect(screen.queryByText(/Prikaži još/)).toBeNull();
  });

  it("reveals more sessions when scrolled to the bottom", async () => {
    const screen = renderScreen(<HonorariTrainerDetail />, TOTAL);
    await waitFor(() =>
      expect(countRows(screen.container, "honorari-session-")).toBe(PAGE_SIZE),
    );

    scrollToBottom(screen.container);
    await waitFor(() =>
      expect(
        countRows(screen.container, "honorari-session-"),
      ).toBeGreaterThan(PAGE_SIZE),
    );
  });

  it("stops at the real total once every session is on screen", async () => {
    const screen = renderScreen(<HonorariTrainerDetail />, PAGE_SIZE + 5);
    await waitFor(() =>
      expect(countRows(screen.container, "honorari-session-")).toBe(PAGE_SIZE),
    );

    scrollToBottom(screen.container);
    await waitFor(() =>
      expect(countRows(screen.container, "honorari-session-")).toBe(
        PAGE_SIZE + 5,
      ),
    );

    // Never overruns the data: a second scroll at the end is a no-op.
    scrollToBottom(screen.container);
    await new Promise((r) => setTimeout(r, 50));
    expect(countRows(screen.container, "honorari-session-")).toBe(PAGE_SIZE + 5);
  });
});

describe("Zarada — infinite scroll", () => {
  it("renders one page of sessions with no load-more button", async () => {
    const screen = renderScreen(<TrainerZarada />, TOTAL);

    await waitFor(() =>
      expect(countRows(screen.container, "zarada-session-")).toBe(PAGE_SIZE),
    );
    expect(screen.queryByTestId("zarada-load-more")).toBeNull();
    expect(screen.queryByText(/Prikaži još/)).toBeNull();
  });

  it("reveals more sessions when scrolled to the bottom", async () => {
    const screen = renderScreen(<TrainerZarada />, TOTAL);
    await waitFor(() =>
      expect(countRows(screen.container, "zarada-session-")).toBe(PAGE_SIZE),
    );

    scrollToBottom(screen.container);
    await waitFor(() =>
      expect(countRows(screen.container, "zarada-session-")).toBeGreaterThan(
        PAGE_SIZE,
      ),
    );
  });
});

describe("payroll list — short-content guard", () => {
  it("reveals past the first page with no scroll when the rows don't fill the viewport", async () => {
    // A viewport tall enough to swallow the first page never fires a scroll
    // event; without the content-size guard the list would sit at 30 forever
    // with nothing the user could do about it.
    const screen = renderScreen(<HonorariTrainerDetail />, TOTAL, 40_000);

    await waitFor(() =>
      expect(countRows(screen.container, "honorari-session-")).toBe(TOTAL),
    );
  });
});
