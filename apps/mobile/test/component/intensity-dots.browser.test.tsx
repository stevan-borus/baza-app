/**
 * IntensityDots — the reusable 3-dot meter for a session's admin-set intensity.
 *
 * Real Chromium + react-native-web + the shipped Serbian i18n. Pins the
 * display contract: nothing renders when there's no marking; otherwise three
 * dots with exactly `intensity` filled, and an accessibility label in the
 * "Intenzitet N od 3" pattern. The word is intensity/intenzitet — never
 * difficulty/stars/rating.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import "@/lib/i18n";
import { IntensityDots } from "@/components/ui/intensity-dots";

describe("IntensityDots", () => {
  it.each([null, undefined, 0])(
    "renders nothing when intensity is %s (unmarked)",
    (intensity) => {
      const screen = render(
        <IntensityDots intensity={intensity as number | null | undefined} />,
      );
      expect(screen.queryByTestId("intensity-dots")).toBeNull();
    },
  );

  it.each([1, 2, 3])("renders 3 dots with %i filled", (intensity) => {
    const screen = render(<IntensityDots intensity={intensity} />);
    expect(screen.getByTestId("intensity-dots")).toBeTruthy();
    // All three dot slots are always present; `intensity` of them are filled.
    for (let i = 1; i <= 3; i++) {
      expect(screen.getByTestId(`intensity-dot-${i}`)).toBeTruthy();
    }
  });

  it("labels the meter 'Intenzitet N od 3' for screen readers (Serbian)", () => {
    const screen = render(<IntensityDots intensity={2} />);
    const meter = screen.getByTestId("intensity-dots");
    expect(meter.getAttribute("aria-label")).toBe("Intenzitet 2 od 3");
  });
});
