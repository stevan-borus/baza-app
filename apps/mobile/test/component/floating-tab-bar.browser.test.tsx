/**
 * Expo Router 58 hands a custom `tabBar` an `emitter` and `navigateToTab`
 * instead of a react-navigation `navigation` object. Pressing a tab must still
 * fire the cancellable `tabPress` event and then switch to that tab, the same
 * contract Expo Router's own BottomTabBar follows.
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import React from "react";
import "@/lib/i18n";
import { FloatingTabBar } from "@/lib/tab-layout-theme";

type TabPressEvent = {
  type: string;
  target?: string;
  canPreventDefault?: boolean;
};

function renderTabBar(
  focusedIndex: number,
  { preventDefault = false }: { preventDefault?: boolean } = {},
) {
  const routes = [
    { key: "pregled-1", name: "pregled" },
    { key: "klijenti-1", name: "klijenti" },
  ];
  const descriptors = Object.fromEntries(
    routes.map((r) => [r.key, { options: { title: r.name } }]),
  );
  const emitted: TabPressEvent[] = [];
  const navigateToTab = vi.fn<(routeKey: string) => void>();
  const emitter = {
    emit: (event: TabPressEvent) => {
      emitted.push(event);
      return { defaultPrevented: preventDefault };
    },
  };

  const screen = render(
    <FloatingTabBar
      isDark={false}
      state={{ routes, index: focusedIndex }}
      descriptors={descriptors as never}
      emitter={emitter as never}
      navigateToTab={navigateToTab}
      insets={{ top: 0, right: 0, bottom: 0, left: 0 }}
    />,
  );
  return { screen, emitted, navigateToTab };
}

describe("pressing a bottom tab", () => {
  it("emits a cancellable tabPress and switches to that tab", () => {
    const { screen, emitted, navigateToTab } = renderTabBar(0);

    fireEvent.click(screen.getByTestId("tab-klijenti"));

    expect(emitted).toEqual([
      { type: "tabPress", target: "klijenti-1", canPreventDefault: true },
    ]);
    expect(navigateToTab).toHaveBeenCalledExactlyOnceWith("klijenti-1");
  });

  it("stays put when the pressed tab is already focused", () => {
    const { screen, emitted, navigateToTab } = renderTabBar(0);

    fireEvent.click(screen.getByTestId("tab-pregled"));

    expect(emitted).toHaveLength(1);
    expect(navigateToTab).not.toHaveBeenCalled();
  });

  it("stays put when a tabPress listener prevents the default", () => {
    const { screen, navigateToTab } = renderTabBar(0, {
      preventDefault: true,
    });

    fireEvent.click(screen.getByTestId("tab-klijenti"));

    expect(navigateToTab).not.toHaveBeenCalled();
  });
});
