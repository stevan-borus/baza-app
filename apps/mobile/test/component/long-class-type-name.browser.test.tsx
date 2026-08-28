/**
 * Long ClassType names must not break layouts.
 *
 * The studio added "StrongHer (funkcionalni trening)" and it overflowed in
 * several places. The worst was the client home hero: the class name sits at
 * fontSize 30 inside a FIXED-height photo card, with the whole day/time/name/
 * room/buttons ribbon absolutely positioned at the bottom. A long name grew the
 * ribbon UPWARD until its top line slid under the greeting — the collision the
 * studio screenshotted ("SUTRA · 15:00-15:55" over "DOBRO VEČE, SLAVICA").
 *
 * These mount the real components in Chromium with react-native-web and real
 * i18n, so the assertions run against measured geometry rather than a guess at
 * how the styles resolve.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { View } from "react-native";
import "@/lib/i18n";
import { NextClassHero } from "@/app/(client)/index";
import { TimeAxisDayView } from "@/components/ui/time-axis-day-view";

const LONG_NAME = "StrongHer (funkcionalni trening)";
const SHORT_NAME = "Reformer";

function heroSession(classTypeName: string) {
  // Tomorrow-ish, well outside the "starts in N min" chip window, so the
  // greeting row is the bare greeting — exactly the screenshotted state.
  const startsAt = new Date(Date.now() + 26 * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 55 * 60 * 1000);
  return {
    id: "s-hero",
    classTypeName,
    startsAt,
    endsAt,
    roomName: "Sala 1",
    capacity: 10,
    bookedCount: 4,
  };
}

function renderHero(classTypeName: string) {
  return render(
    <NextClassHero
      session={heroSession(classTypeName)}
      lang="sr"
      onPress={() => {}}
      onCancel={() => {}}
      userName="Slavica"
      greeting="Dobro veče"
    />,
  );
}

describe("client home hero with a long class name", () => {
  it("renders the full class name without truncating it away", () => {
    const screen = renderHero(LONG_NAME);
    expect(screen.getByText(LONG_NAME)).toBeTruthy();
  });

  it("keeps the info ribbon from overlapping the greeting", () => {
    const screen = renderHero(LONG_NAME);
    const greeting = screen.getByText(/Dobro veče/);
    const className = screen.getByText(LONG_NAME);

    const greetingBox = greeting.getBoundingClientRect();
    // The ribbon's own top line is the day/time row; walking up from the class
    // name to the ribbon container is what the overlap actually happens to.
    const ribbon = className.parentElement!;
    const ribbonBox = ribbon.getBoundingClientRect();

    // The greeting must finish above where the ribbon starts. This is the
    // regression: with a fixed-height card + absolute bottom ribbon, a long
    // name pushed ribbonBox.top ABOVE greetingBox.bottom.
    expect(ribbonBox.top).toBeGreaterThanOrEqual(greetingBox.bottom);
  });

  it("grows the card for a long name instead of overflowing a fixed height", () => {
    const shortScreen = renderHero(SHORT_NAME);
    const shortCard = shortScreen.getByTestId("home-hero-card");
    const shortHeight = shortCard.getBoundingClientRect().height;
    shortScreen.unmount();

    const longScreen = renderHero(LONG_NAME);
    const longCard = longScreen.getByTestId("home-hero-card");
    const longBox = longCard.getBoundingClientRect();

    // A two-line name needs more card than a one-line name. Equal heights mean
    // the card is still pinned to 260 and the extra line went somewhere it
    // shouldn't have.
    expect(longBox.height).toBeGreaterThan(shortHeight);
  });

  it("keeps the whole ribbon inside the card, buttons included", () => {
    const screen = renderHero(LONG_NAME);
    const card = screen.getByTestId("home-hero-card").getBoundingClientRect();
    const ribbon = screen
      .getByTestId("home-hero-ribbon")
      .getBoundingClientRect();

    // With the fixed height the ribbon was taller than the space above the
    // card bottom allowed, so its top escaped the card. Sub-pixel rounding
    // from react-native-web's layout makes an exact compare flaky.
    expect(ribbon.top).toBeGreaterThanOrEqual(card.top - 1);
    expect(ribbon.bottom).toBeLessThanOrEqual(card.bottom + 1);
  });
});

describe("day-view session card with a long class name", () => {
  // The audit's worst case, reproduced exactly: TWO concurrent sessions, so
  // each block is HALF width (`widthPct = 100 / cols`), each only 45 minutes
  // long so `compact` is true and the Intermediate/MixedGroup marks move onto
  // the title row, AND each is both cutoff-locked and full — four elements
  // competing on one line in a ~45px-tall, half-width card.
  const sessions = [
    {
      id: "s1",
      classTypeName: LONG_NAME,
      startsAt: "2026-05-11T08:00:00.000Z",
      endsAt: "2026-05-11T08:45:00.000Z",
      roomName: "Sala 1",
      trainerName: "Ana",
      capacity: 8,
      bookedCount: 8,
      isIntermediate: true,
      isMixedGroup: true,
      emptyCutoffLocked: true,
    },
    {
      id: "s2",
      classTypeName: LONG_NAME,
      startsAt: "2026-05-11T08:00:00.000Z",
      endsAt: "2026-05-11T08:45:00.000Z",
      roomName: "Sala 2",
      trainerName: "Mila",
      capacity: 8,
      bookedCount: 8,
      isIntermediate: true,
      isMixedGroup: true,
      emptyCutoffLocked: true,
    },
  ];

  function renderDayView() {
    // Pinned to a real phone viewport. The blocks are absolutely positioned at
    // a percentage width, so without a bounded ancestor they get the whole
    // browser window and nothing ever competes for space.
    return render(
      <View style={{ width: 390 }}>
        <TimeAxisDayView
          sessions={sessions}
          date="2026-05-11"
          onSessionPress={() => {}}
        />
      </View>,
    );
  }

  // NOTE on what this layer can and cannot assert: uniwind's className→style
  // rewriting only runs inside Metro, so `flex-row` and friends are inert in
  // Vitest browser mode (see test/component/stubs/uniwind.ts and AGENTS.md).
  // Row geometry therefore can't be measured here — every child stacks at full
  // width. What IS real is the render contract: which elements exist, that the
  // full name survives rather than being dropped, and the inline `style` props
  // that carry the shrink priority. The visual result is verified by the
  // inline styles below plus e2e.

  it("renders the full class name on every concurrent block, never dropped", () => {
    const screen = renderDayView();
    expect(screen.getAllByText(LONG_NAME)).toHaveLength(2);
  });

  it("keeps the capacity badge present on a compact, locked, full block", () => {
    const screen = renderDayView();
    // The audit's worry was the capacity badge being squeezed out by the
    // title and the Zatvoreno chip. It is the priority secondary info, so it
    // must render on every block regardless of how long the title is.
    expect(screen.getAllByText("8/8")).toHaveLength(2);
    expect(
      screen.getAllByTestId(/session-block-empty-cutoff-/),
    ).toHaveLength(2);
  });

  it("marks the title shrinkable and the capacity badge non-shrinkable", () => {
    const screen = renderDayView();
    const [title] = screen.getAllByText(LONG_NAME);
    const [capacity] = screen.getAllByText("8/8");

    // The shrink priority is what stops the title running under the badge on
    // a narrow block: the title yields (and ellipsizes via numberOfLines={1}),
    // the badge holds its width. minWidth:0 is the load-bearing half — without
    // it a flex item's min-width is its content and it refuses to shrink.
    expect(title!.style.minWidth).toBe("0px");
    expect(title!.style.flexShrink).toBe("1");

    const badge = capacity!.closest("[style*='flex-shrink']") as HTMLElement | null;
    expect(badge?.style.flexShrink).toBe("0");
  });
});

describe("closed-session signal on a shared row", () => {
  // The studio screenshot: two 5 PM classes side-by-side rendered as "R." and
  // "E..". `widthPct = 100 / cols` gives each ~155pt, and the "Zatvoreno" word
  // badge (~72pt) plus the capacity pill (~38pt) ate almost all of it. The name
  // is the ONLY thing identifying which class the block is, so on a shared row
  // the word collapses to a lock glyph riding the capacity pill.
  //
  // Redundancy is why that's safe: isEmptySessionCutoffLocked() returns false
  // whenever activeBookingsCount > 0, so a locked block always reads "0/N"
  // anyway — the word was restating the pill for ~72pt.
  //
  // Same caveat as above: uniwind classNames are inert outside Metro, so this
  // asserts the render contract (which elements exist per `cols`) and the
  // inline shrink styles, never measured row geometry.

  function closedSession(
    id: string,
    over: Partial<{ startsAt: string; endsAt: string }> = {},
  ) {
    return {
      id,
      classTypeName: LONG_NAME,
      startsAt: "2026-05-11T17:00:00.000Z",
      endsAt: "2026-05-11T17:50:00.000Z",
      roomName: "Sala 1",
      capacity: 6,
      // A locked session is empty by definition — the cutoff only fires at
      // zero bookings.
      bookedCount: 0,
      emptyCutoffLocked: true,
      ...over,
    };
  }

  function renderSessions(sessions: ReturnType<typeof closedSession>[]) {
    return render(
      <View style={{ width: 390 }}>
        <TimeAxisDayView
          sessions={sessions}
          date="2026-05-11"
          onSessionPress={() => {}}
        />
      </View>,
    );
  }

  it("drops the Zatvoreno word for a lock glyph when two sessions share the row", () => {
    const screen = renderSessions([closedSession("s1"), closedSession("s2")]);

    // The word is what was starving the title — it must be gone at cols > 1.
    expect(screen.queryByText("Zatvoreno")).toBeNull();
    // …and replaced by the lock, one per block, on the capacity pill.
    expect(screen.getAllByTestId("lucide-Lock")).toHaveLength(2);
    expect(screen.getAllByText("0/6")).toHaveLength(2);
    // Full name still rendered on both, never dropped.
    expect(screen.getAllByText(LONG_NAME)).toHaveLength(2);
  });

  it("keeps the closed state announced to screen readers in the lock variant", () => {
    const screen = renderSessions([closedSession("s1"), closedSession("s2")]);

    // Colour/glyph is never the only channel — the lock carries the same a11y
    // label the word badge does.
    const marks = screen.getAllByTestId(/^session-block-empty-cutoff-/);
    expect(marks).toHaveLength(2);
    for (const mark of marks) {
      expect(mark.getAttribute("aria-label")).toBe(
        "Prijave zatvorene — nema prijavljenih klijenata",
      );
    }
  });

  it("keeps the testID stable across both variants", () => {
    // Per AGENTS.md a testID must not encode mutating state: the same id
    // selects the mark whether it renders as the word or the lock, so existing
    // specs keep working.
    const narrow = renderSessions([closedSession("s1"), closedSession("s2")]);
    expect(narrow.getByTestId("session-block-empty-cutoff-s1")).toBeTruthy();
    narrow.unmount();

    const wide = renderSessions([closedSession("s1")]);
    expect(wide.getByTestId("session-block-empty-cutoff-s1")).toBeTruthy();
  });

  it("uses the lock on a lone full-width block too", () => {
    const screen = renderSessions([closedSession("s1")]);

    // One representation per state, at every width. An earlier cut showed the
    // word here and the glyph on shared rows; down a real day that read as two
    // different states rather than one, so the width branch is gone.
    expect(screen.queryByText("Zatvoreno")).toBeNull();
    expect(screen.getByTestId("lucide-Lock")).toBeTruthy();
    expect(
      screen
        .getByTestId("session-block-empty-cutoff-s1")
        .getAttribute("aria-label"),
    ).toBe("Prijave zatvorene — nema prijavljenih klijenata");
  });

  it("uses the lock on a compact full-width block", () => {
    // 20 minutes → height clamps under 44, so `compact` drops the meta line and
    // the marks ride the title row. One line, one chance: the word goes.
    const screen = renderSessions([
      closedSession("s1", {
        startsAt: "2026-05-11T17:00:00.000Z",
        endsAt: "2026-05-11T17:20:00.000Z",
      }),
    ]);

    expect(screen.queryByText("Zatvoreno")).toBeNull();
    expect(screen.getByTestId("lucide-Lock")).toBeTruthy();
    expect(screen.getByText("0/6")).toBeTruthy();
  });

  it("gives the title the remaining space and lets the closed mark hold its width", () => {
    const screen = renderSessions([closedSession("s1"), closedSession("s2")]);
    const [title] = screen.getAllByText(LONG_NAME);
    const [mark] = screen.getAllByTestId(/^session-block-empty-cutoff-/);

    // The title is the highest-value element: it takes remaining space
    // (flexGrow 1) and yields last. minWidth 0 must be on every level of its
    // column chain — one missing level and a flex item's content min-width
    // wins, which is what pushed the name under the badge.
    expect(title!.style.flexShrink).toBe("1");
    expect(title!.style.minWidth).toBe("0px");
    const titleColumn = title!.parentElement!;
    expect(titleColumn.style.minWidth).toBe("0px");
    expect(titleColumn.parentElement!.style.minWidth).toBe("0px");
    expect(titleColumn.parentElement!.style.flexGrow).toBe("1");

    // Secondary chrome never eats into the title's share.
    expect(mark!.style.flexShrink).toBe("0");
  });
});
