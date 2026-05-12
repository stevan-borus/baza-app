/**
 * ClientDetailTabBar structural tests.
 *
 * The flat <ClientDetail> page was split into Pregled / Paketi / Treninzi
 * tabs (PR δ of the round-7 UI sweep). The tab strip is its own pure
 * component so we can exercise the rendering and onChange contract without
 * spinning up the full React Native + TanStack-Query environment.
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const pressables: Record<string, { onPress?: () => void }> = {};

vi.mock("react-native", () => {
  const RR = require("react");
  return {
    View: ({ children, style, className, testID, ...p }: any) =>
      RR.createElement(
        "div",
        {
          ...p,
          "data-testid": testID,
          "data-class": className,
          style: typeof style === "object" && !Array.isArray(style) ? style : undefined,
        },
        children,
      ),
    Text: ({ children, style, className, testID, ...p }: any) =>
      RR.createElement(
        "span",
        {
          ...p,
          "data-testid": testID,
          "data-class": className,
          style: typeof style === "object" ? style : undefined,
        },
        children,
      ),
    Pressable: ({ children, onPress, testID, className, ...p }: any) => {
      if (testID) pressables[testID] = { onPress };
      return RR.createElement(
        "button",
        {
          ...p,
          "data-testid": testID,
          "data-class": className,
        },
        children,
      );
    },
    Platform: { OS: "web" },
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string) => k,
  }),
}));

vi.mock("@/components/ui/tokens", () => ({
  useThemeTokens: () => ({
    foreground: "#000",
    faint: "#999",
    background: "#fff",
    accent: "#1f3d2b",
  }),
}));

import { ClientDetailTabBar, type ClientDetailTab } from "@/components/admin/client-detail-tab-bar";

function render(active: ClientDetailTab, onChange = vi.fn()) {
  return renderToStaticMarkup(
    React.createElement(ClientDetailTabBar, { active, onChange }),
  );
}

describe("ClientDetailTabBar", () => {
  it("renders all three tabs with i18n labels", () => {
    const html = render("pregled");
    expect(html).toContain("admin.clientDetail.tabs.pregled");
    expect(html).toContain("admin.clientDetail.tabs.paketi");
    expect(html).toContain("admin.clientDetail.tabs.treninzi");
  });

  it("exposes stable testIDs for each tab", () => {
    const html = render("pregled");
    expect(html).toContain('data-testid="client-detail-tab-pregled"');
    expect(html).toContain('data-testid="client-detail-tab-paketi"');
    expect(html).toContain('data-testid="client-detail-tab-treninzi"');
  });

  it("invokes onChange with the next tab value when a tab is pressed", () => {
    const onChange = vi.fn();
    render("pregled", onChange);
    pressables["client-detail-tab-paketi"]?.onPress?.();
    expect(onChange).toHaveBeenCalledWith("paketi");
    pressables["client-detail-tab-treninzi"]?.onPress?.();
    expect(onChange).toHaveBeenCalledWith("treninzi");
  });
});
