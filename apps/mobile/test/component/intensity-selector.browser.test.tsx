/**
 * IntensitySelector — the admin four-state picker (none / ● / ●● / ●●●) used in
 * the session edit sheet. Real Chromium + shipped Serbian i18n.
 *
 * Pins the write-UI contract: four options, the current value highlighted,
 * tapping a level reports 1/2/3, tapping "none" reports null (clears the
 * marking). Editable any time — no confirm, no booking gating here.
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import React from "react";
import "@/lib/i18n";
import { IntensitySelector } from "@/components/ui/intensity-selector";

describe("IntensitySelector", () => {
  it("renders a none option plus three intensity levels", () => {
    const screen = render(
      <IntensitySelector value={null} onChange={() => {}} />,
    );
    expect(screen.getByTestId("session-intensity-selector")).toBeTruthy();
    expect(screen.getByTestId("intensity-option-none")).toBeTruthy();
    expect(screen.getByTestId("intensity-option-1")).toBeTruthy();
    expect(screen.getByTestId("intensity-option-2")).toBeTruthy();
    expect(screen.getByTestId("intensity-option-3")).toBeTruthy();
  });

  it.each([1, 2, 3])("reports %i when that level is tapped", (level) => {
    const onChange = vi.fn();
    const screen = render(
      <IntensitySelector value={null} onChange={onChange} />,
    );
    fireEvent.click(screen.getByTestId(`intensity-option-${level}`));
    expect(onChange).toHaveBeenCalledWith(level);
  });

  it("reports null when 'none' is tapped (clears the marking)", () => {
    const onChange = vi.fn();
    const screen = render(
      <IntensitySelector value={2} onChange={onChange} />,
    );
    fireEvent.click(screen.getByTestId("intensity-option-none"));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("marks the active option as pressed for screen readers", () => {
    const screen = render(
      <IntensitySelector value={2} onChange={() => {}} />,
    );
    expect(
      screen.getByTestId("intensity-option-2").getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByTestId("intensity-option-none").getAttribute("aria-pressed"),
    ).toBe("false");
  });
});
