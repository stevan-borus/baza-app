/**
 * ClientDetailTabBar behavior tests — real i18n labels, real presses.
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import React from "react";
import "@/lib/i18n";
import {
  ClientDetailTabBar,
  type ClientDetailTab,
} from "@/components/admin/client-detail-tab-bar";

function renderBar(active: ClientDetailTab, onChange: (t: ClientDetailTab) => void = () => {}) {
  return render(<ClientDetailTabBar active={active} onChange={onChange} />);
}

describe("ClientDetailTabBar", () => {
  it("renders all four tabs with their Serbian labels and testIDs", () => {
    const screen = renderBar("pregled");
    for (const [testID, label] of [
      ["client-detail-tab-pregled", "Pregled"],
      ["client-detail-tab-paketi", "Paketi"],
      ["client-detail-tab-treninzi", "Treninzi"],
      ["client-detail-tab-beleske", "Beleške"],
    ]) {
      expect(screen.getByTestId(testID).textContent).toBe(label);
    }
  });

  it("pressing a tab reports its value through onChange", () => {
    const onChange = vi.fn();
    const screen = renderBar("pregled", onChange);

    for (const tab of ["paketi", "treninzi", "beleske"] as const) {
      fireEvent.click(screen.getByTestId(`client-detail-tab-${tab}`));
      expect(onChange).toHaveBeenLastCalledWith(tab);
    }
  });
});
