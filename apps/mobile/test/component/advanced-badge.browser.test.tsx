/**
 * AdvancedBadge — the bare fire-emoji mark on a session's time line, flagging
 * it as an advanced (hard) occurrence. Real Chromium + react-native-web +
 * shipped Serbian i18n.
 *
 * Pins the display contract: nothing renders when the session isn't marked;
 * when it is, the shipped 🔥 glyph shows and the word "Napredni trening" lives
 * only in the a11y label — never as visible card copy.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import "@/lib/i18n";
import { AdvancedBadge } from "@/components/ui/advanced-badge";

describe("AdvancedBadge", () => {
  it.each([false, undefined])(
    "renders nothing when isAdvanced is %s (unmarked)",
    (isAdvanced) => {
      const screen = render(
        <AdvancedBadge isAdvanced={isAdvanced as boolean | undefined} />,
      );
      expect(screen.queryByTestId("advanced-badge")).toBeNull();
    },
  );

  it("renders the fire glyph when marked", () => {
    const screen = render(<AdvancedBadge isAdvanced />);
    expect(screen.getByTestId("advanced-badge")).toBeTruthy();
    expect(screen.getByText("🔥")).toBeTruthy();
  });

  it("keeps the word out of the visible copy by default", () => {
    // Dense rows are wordless; only the booking sheet opts into the label
    // via showLabel, so the default must never leak the word.
    const screen = render(<AdvancedBadge isAdvanced />);
    expect(screen.queryByText("Napredno")).toBeNull();
    expect(screen.queryByText(/Napredni trening/)).toBeNull();
  });

  it("labels the mark as advanced training for screen readers", () => {
    const screen = render(<AdvancedBadge isAdvanced />);
    expect(
      screen.getByTestId("advanced-badge").getAttribute("aria-label"),
    ).toBe("Napredni trening");
  });

  it("scales the detail size up from the compact default", () => {
    const compact = render(<AdvancedBadge isAdvanced />);
    const compactSize = parseFloat(
      getComputedStyle(compact.getByText("🔥")).fontSize,
    );
    compact.unmount();

    const detail = render(<AdvancedBadge isAdvanced size="detail" />);
    const detailSize = parseFloat(
      getComputedStyle(detail.getByText("🔥")).fontSize,
    );
    expect(detailSize).toBeGreaterThan(compactSize);
  });
});
