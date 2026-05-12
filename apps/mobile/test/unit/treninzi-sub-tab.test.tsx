/**
 * TreninziSubTab rendering + interaction.
 *
 * The Treninzi tab in ClientDetail uses these pills to flip between
 * Predstojeci and Istorija. The active pill renders a 2px foreground
 * underline; inactive renders transparent. The user-feedback round called
 * out the previous chip-style pills as "not good" — this test pins the
 * underline contract so a refactor doesn't quietly drop it.
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
    Pressable: ({ children, onPress, testID, className, style, ...p }: any) => {
      if (testID) pressables[testID] = { onPress };
      return RR.createElement(
        "button",
        {
          ...p,
          "data-testid": testID,
          "data-class": className,
          style: typeof style === "object" && !Array.isArray(style) ? style : undefined,
        },
        children,
      );
    },
    Platform: { OS: "web" },
  };
});

vi.mock("@/components/ui/tokens", () => ({
  useThemeTokens: () => ({
    foreground: "#000",
    faint: "#999",
    background: "#fff",
    accent: "#1f3d2b",
  }),
}));

import { TreninziSubTab } from "@/components/admin/treninzi-sub-tab";

function render(active: boolean) {
  return renderToStaticMarkup(
    React.createElement(TreninziSubTab, {
      testID: "treninzi-pill-test",
      label: "Predstojeci",
      active,
      onPress: vi.fn(),
    }),
  );
}

describe("TreninziSubTab", () => {
  it("paints a foreground underline when active", () => {
    const html = render(true);
    // The active border color is the theme's foreground (#000 in the mock).
    expect(html).toContain("border-bottom-color:#000");
    // Bold/semibold typography when active.
    expect(html).toContain("text-foreground");
    expect(html).toContain("font-body-semibold");
  });

  it("keeps the underline transparent when inactive", () => {
    const html = render(false);
    expect(html).toContain("border-bottom-color:transparent");
    // Muted typography when inactive.
    expect(html).toContain("text-muted");
    expect(html).toContain("font-body-medium");
  });

  it("invokes onPress when tapped", () => {
    const onPress = vi.fn();
    renderToStaticMarkup(
      React.createElement(TreninziSubTab, {
        testID: "treninzi-pill-test",
        label: "Istorija",
        active: false,
        onPress,
      }),
    );
    pressables["treninzi-pill-test"]?.onPress?.();
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
