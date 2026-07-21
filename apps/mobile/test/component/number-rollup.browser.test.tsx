/**
 * NumberRollup behavior tests.
 *
 * The rollup must render its FIRST value statically — no 0 → N spike on
 * mount (users misread the placeholder peak) — while later prop changes
 * animate to the new target. The old static-markup tests could only see
 * the first half; here the rAF animation actually runs.
 */
import { describe, it, expect } from "vitest";
import { render, waitFor } from "@testing-library/react";
import React from "react";
import { NumberRollup } from "@/components/ui/number-rollup";

describe("NumberRollup", () => {
  it("renders the initial value statically on mount (no 0-to-N spike)", () => {
    const screen = render(<NumberRollup value={5} />);
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("respects the formatter on first render (no raw 0 leaking through)", () => {
    const screen = render(
      <NumberRollup
        value={37000}
        formatter={(n) => `${Math.round(n).toLocaleString("sr-RS")} RSD`}
      />,
    );
    expect(screen.getByText(/37[.,\s]?000\s*RSD/)).toBeTruthy();
  });

  it("animates a later value change to the new target", async () => {
    const screen = render(<NumberRollup value={5} durationMs={40} />);
    expect(screen.getByText("5")).toBeTruthy();

    screen.rerender(<NumberRollup value={12} durationMs={40} />);

    await waitFor(() => expect(screen.getByText("12")).toBeTruthy());
  });
});
