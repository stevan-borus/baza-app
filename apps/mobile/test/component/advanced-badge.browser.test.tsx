/**
 * AdvancedBadge — the outlined text badge marking a session as an advanced
 * (hard) occurrence. Real Chromium + react-native-web + shipped Serbian i18n.
 *
 * Pins the display contract: nothing renders when the session isn't marked;
 * when it is, the shipped normal-case "Napredno" copy shows. The word is
 * advanced/napredno — never intensity, difficulty, stars, or levels; the copy
 * is normal case, not uppercase (owner rejected uppercase).
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

  it("renders the shipped 'Napredno' copy when marked", () => {
    const screen = render(<AdvancedBadge isAdvanced />);
    expect(screen.getByTestId("advanced-badge")).toBeTruthy();
    expect(screen.getByText("Napredno")).toBeTruthy();
  });

  it("keeps the copy in normal case, not uppercase", () => {
    const screen = render(<AdvancedBadge isAdvanced />);
    const label = screen.getByText("Napredno");
    // The shipped string is normal case; the badge must not transform it.
    expect(getComputedStyle(label).textTransform).not.toBe("uppercase");
  });

  it("labels the badge as advanced training for screen readers", () => {
    const screen = render(<AdvancedBadge isAdvanced />);
    expect(
      screen.getByTestId("advanced-badge").getAttribute("aria-label"),
    ).toBe("Napredni trening");
  });

  it("scales the detail size up from the compact default", () => {
    const compact = render(<AdvancedBadge isAdvanced />);
    const compactSize = parseFloat(
      getComputedStyle(compact.getByText("Napredno")).fontSize,
    );
    compact.unmount();

    const detail = render(<AdvancedBadge isAdvanced size="detail" />);
    const detailSize = parseFloat(
      getComputedStyle(detail.getByText("Napredno")).fontSize,
    );
    expect(detailSize).toBeGreaterThan(compactSize);
  });
});
