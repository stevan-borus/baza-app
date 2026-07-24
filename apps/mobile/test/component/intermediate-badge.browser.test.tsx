/**
 * IntermediateBadge — the bare accent-green ★ mark on a session's time line,
 * flagging it as an intermediate-level ("srednji nivo") occurrence. Real
 * Chromium + react-native-web + shipped Serbian i18n.
 *
 * Pins the display contract: nothing renders when the session isn't marked;
 * when it is, the shipped ★ glyph shows tinted the accent (not inherited ink),
 * and the word "Srednji nivo" lives only in the a11y label and the showLabel
 * variant — "Napredno"/"Napredni" appears nowhere.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { Text } from "react-native";
import "@/lib/i18n";
import { IntermediateBadge } from "@/components/ui/intermediate-badge";

describe("IntermediateBadge", () => {
  it.each([false, undefined])(
    "renders nothing when isIntermediate is %s (unmarked)",
    (isIntermediate) => {
      const screen = render(
        <IntermediateBadge
          isIntermediate={isIntermediate as boolean | undefined}
        />,
      );
      expect(screen.queryByTestId("intermediate-badge")).toBeNull();
    },
  );

  it("renders the star glyph when marked", () => {
    const screen = render(<IntermediateBadge isIntermediate />);
    expect(screen.getByTestId("intermediate-badge")).toBeTruthy();
    expect(screen.getByText("★")).toBeTruthy();
  });

  it("keeps the word out of the visible copy by default", () => {
    // Dense rows are wordless; only the booking sheet opts into the label
    // via showLabel, so the default must never leak the word.
    const screen = render(<IntermediateBadge isIntermediate />);
    expect(screen.queryByText("Srednji nivo")).toBeNull();
    expect(screen.queryByText(/Napredn/)).toBeNull();
  });

  it("labels the mark as intermediate-level training for screen readers", () => {
    const screen = render(<IntermediateBadge isIntermediate />);
    expect(
      screen.getByTestId("intermediate-badge").getAttribute("aria-label"),
    ).toBe("Trening srednjeg nivoa");
  });

  it("expands to glyph + 'Srednji nivo' when showLabel is set", () => {
    const screen = render(<IntermediateBadge isIntermediate showLabel />);
    const badge = screen.getByTestId("intermediate-badge");
    expect(badge.textContent).toContain("★");
    expect(badge.textContent).toContain("Srednji nivo");
    // The visible word is `label`, NOT the a11y phrase — they differ now.
    expect(badge.textContent).not.toContain("Trening srednjeg nivoa");
  });

  it("tints the star with the accent, not the inherited ink", () => {
    // A baseline plain Text inherits the default ink; rendered in the same
    // document it gives us the color the star must NOT be.
    const baseline = render(<Text>★</Text>);
    const inkColor = getComputedStyle(baseline.getByText("★")).color;
    baseline.unmount();

    const screen = render(<IntermediateBadge isIntermediate />);
    const starColor = getComputedStyle(screen.getByText("★")).color;
    // The star carries its own accent tint — distinct from default text ink.
    expect(starColor).not.toBe(inkColor);
    expect(starColor.length).toBeGreaterThan(0);
  });

  it("scales the detail size up from the compact default", () => {
    const compact = render(<IntermediateBadge isIntermediate />);
    const compactSize = parseFloat(
      getComputedStyle(compact.getByText("★")).fontSize,
    );
    compact.unmount();

    const detail = render(<IntermediateBadge isIntermediate size="detail" />);
    const detailSize = parseFloat(
      getComputedStyle(detail.getByText("★")).fontSize,
    );
    expect(detailSize).toBeGreaterThan(compactSize);
  });
});
