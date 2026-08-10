/**
 * MixedGroupBadge — the accent-tinted ♀♂ mark on a session's time line,
 * flagging the occurrence as a mixed group (men and women train together).
 * Real Chromium + react-native-web + shipped Serbian i18n.
 *
 * Pins the display contract, mirroring IntermediateBadge: nothing renders when
 * unmarked; when marked the shipped ♀♂ pair shows tinted the accent (not
 * inherited ink), and the words live only in the a11y label and the showLabel
 * variant.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { Text } from "react-native";
import "@/lib/i18n";
import { MixedGroupBadge } from "@/components/ui/mixed-group-badge";

describe("MixedGroupBadge", () => {
  it.each([false, undefined])(
    "renders nothing when isMixedGroup is %s (unmarked)",
    (isMixedGroup) => {
      const screen = render(
        <MixedGroupBadge isMixedGroup={isMixedGroup as boolean | undefined} />,
      );
      expect(screen.queryByTestId("mixed-group-badge")).toBeNull();
    },
  );

  it("renders the venus+mars glyph pair when marked", () => {
    const screen = render(<MixedGroupBadge isMixedGroup />);
    expect(screen.getByTestId("mixed-group-badge")).toBeTruthy();
    expect(screen.getByText("♀♂")).toBeTruthy();
  });

  it("keeps the words out of the visible copy by default", () => {
    // Dense rows are wordless; only detail sheets opt into the label.
    const screen = render(<MixedGroupBadge isMixedGroup />);
    expect(screen.queryByText("Mešana grupa")).toBeNull();
  });

  it("labels the mark as a mixed group for screen readers", () => {
    const screen = render(<MixedGroupBadge isMixedGroup />);
    expect(
      screen.getByTestId("mixed-group-badge").getAttribute("aria-label"),
    ).toBe("Mešana grupa — treniraju muškarci i žene");
  });

  it("expands to glyph + 'Mešana grupa' when showLabel is set", () => {
    const screen = render(<MixedGroupBadge isMixedGroup showLabel />);
    const badge = screen.getByTestId("mixed-group-badge");
    expect(badge.textContent).toContain("♀♂");
    expect(badge.textContent).toContain("Mešana grupa");
  });

  it("tints the glyph with the accent, not the inherited ink", () => {
    const baseline = render(<Text>♀♂</Text>);
    const inkColor = getComputedStyle(baseline.getByText("♀♂")).color;
    baseline.unmount();

    const screen = render(<MixedGroupBadge isMixedGroup />);
    const glyphColor = getComputedStyle(screen.getByText("♀♂")).color;
    expect(glyphColor).not.toBe(inkColor);
    expect(glyphColor.length).toBeGreaterThan(0);
  });

  it("scales the detail size up from the compact default", () => {
    const compact = render(<MixedGroupBadge isMixedGroup />);
    const compactSize = parseFloat(
      getComputedStyle(compact.getByText("♀♂")).fontSize,
    );
    compact.unmount();

    const detail = render(<MixedGroupBadge isMixedGroup size="detail" />);
    const detailSize = parseFloat(
      getComputedStyle(detail.getByText("♀♂")).fontSize,
    );
    expect(detailSize).toBeGreaterThan(compactSize);
  });
});
