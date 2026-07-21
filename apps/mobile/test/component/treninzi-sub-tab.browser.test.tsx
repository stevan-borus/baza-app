/**
 * TreninziSubTab behavior tests.
 *
 * The Predstojeci/Istorija pills in client detail pin their contract with a
 * 2px underline: foreground-colored when active, transparent when not. The
 * user-feedback round rejected the old chip styling — these tests keep a
 * refactor from quietly dropping the underline. Real computed styles, real
 * presses.
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import React from "react";
import { TreninziSubTab } from "@/components/admin/treninzi-sub-tab";

function renderPill(active: boolean, onPress: () => void = () => {}) {
  return render(
    <TreninziSubTab
      testID="treninzi-pill"
      label="Predstojeci"
      active={active}
      onPress={onPress}
    />,
  );
}

describe("TreninziSubTab", () => {
  it("paints an opaque underline when active", () => {
    const screen = renderPill(true);
    const { borderBottomColor, borderBottomWidth } = getComputedStyle(
      screen.getByTestId("treninzi-pill"),
    );
    expect(borderBottomWidth).toBe("2px");
    expect(borderBottomColor).not.toBe("rgba(0, 0, 0, 0)");
  });

  it("keeps the underline transparent when inactive", () => {
    const screen = renderPill(false);
    const { borderBottomColor } = getComputedStyle(
      screen.getByTestId("treninzi-pill"),
    );
    expect(borderBottomColor).toBe("rgba(0, 0, 0, 0)");
  });

  it("fires onPress on tap", () => {
    const onPress = vi.fn();
    const screen = renderPill(false, onPress);

    fireEvent.click(screen.getByTestId("treninzi-pill"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
