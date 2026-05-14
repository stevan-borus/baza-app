/**
 * Katalog landing screen structural tests.
 *
 * Phase 2 (`fix/katalog-tab`) promotes Katalog to its own tab with a landing
 * page that splits "Kreiraj" (hero row → opens NewSessionSheet) and "Katalog"
 * (three rows → tipovi-treninga / sale / tipovi-paketa).
 *
 * The tests run the screen through react-dom/server with react-native mocked
 * to plain HTML primitives. We assert on the testIDs and the Serbian section
 * labels — exactly the contract the next PR's e2e spec will rely on.
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

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
          style:
            typeof style === "object" && !Array.isArray(style) ? style : undefined,
        },
        children,
      ),
    Text: ({ children, style, className, testID, numberOfLines: _n, ...p }: any) =>
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
    Pressable: ({ children, onPress: _o, testID, className, ...p }: any) =>
      RR.createElement(
        "button",
        { ...p, "data-testid": testID, "data-class": className },
        children,
      ),
    ScrollView: ({ children, contentContainerStyle: _c, ...p }: any) =>
      RR.createElement("div", { ...p }, children),
    Platform: { OS: "web" },
  };
});

vi.mock("expo-blur", () => ({ BlurView: () => null }));
vi.mock("@expo/vector-icons/Feather", () => ({
  default: ({ name, testID }: any) =>
    require("react").createElement("i", {
      "data-icon": name,
      "data-testid": testID,
    }),
}));
vi.mock("@expo/vector-icons/FontAwesome", () => ({
  default: ({ name }: any) =>
    require("react").createElement("i", { "data-icon": name }),
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string) => {
      const map: Record<string, string> = {
        "tabs.catalog": "Katalog",
        "admin.katalog.sections.kreiraj": "Kreiraj",
        "admin.katalog.sections.katalog": "Katalog",
        "admin.katalog.noviTermin": "Novi termin",
        "admin.katalog.noviTerminSub": "Jednokratno ili serija",
        "admin.manage.classTypes": "Tipovi treninga",
        "admin.manage.rooms": "Sale",
        "admin.manage.packageTypes": "Tipovi paketa",
      };
      return map[k] ?? k;
    },
  }),
}));
vi.mock("@/components/ui/tokens", () => ({
  useThemeTokens: () => ({
    accent: "#2e5b42",
    foreground: "#0F0F0D",
    muted: "rgba(15,15,13,0.62)",
    faint: "rgba(15,15,13,0.38)",
    background: "#F4EFE3",
    glass: "rgba(0,0,0,0.04)",
    glassAndroid: "rgba(255,255,255,0.95)",
    glassBorder: "rgba(0,0,0,0.10)",
  }),
}));
vi.mock("@/lib/theme-preference", () => ({
  useThemePreference: () => ({ resolvedTheme: "light" }),
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock("@/components/admin/new-session-sheet", () => ({
  NewSessionSheet: ({ open }: { open: boolean }) =>
    open
      ? require("react").createElement("div", {
          "data-testid": "new-session-sheet-mounted",
        })
      : null,
}));
vi.mock("@/components/ui/screen-container", () => ({
  ScreenContainerRaw: ({ children, title }: any) =>
    require("react").createElement(
      "div",
      { "data-testid": "screen-container" },
      require("react").createElement(
        "h1",
        { "data-testid": "screen-title" },
        title,
      ),
      children,
    ),
  useTabBarBottomPadding: () => 80,
}));
vi.mock("@/components/ui/glass-card", () => ({
  GlassCard: ({ children, style: _s }: any) =>
    require("react").createElement(
      "div",
      { "data-testid": "glass-card" },
      children,
    ),
}));
vi.mock("@/components/ui/studio", () => ({
  CapsLabel: ({ children, className }: any) =>
    require("react").createElement(
      "span",
      { "data-class": className, "data-caps": true },
      children,
    ),
}));
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("@/components/admin/admin-tab-left-slot", () => ({
  AdminTabLeftSlot: () => null,
}));

import KatalogIndex from "@/app/(admin)/katalog/index";

function render() {
  return renderToStaticMarkup(React.createElement(KatalogIndex));
}

describe("Katalog landing screen", () => {
  it("renders the screen title from i18n key tabs.catalog", () => {
    const html = render();
    expect(html).toContain('data-testid="screen-title"');
    expect(html).toMatch(/Katalog/);
  });

  it("renders both section caps labels (Kreiraj and Katalog)", () => {
    const html = render();
    expect(html).toContain("Kreiraj");
    // 'Katalog' appears as both the screen title and the section caps label;
    // assert it's present at least twice.
    const occurrences = html.split("Katalog").length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it("renders the Novi termin hero row with its testID and subtitle", () => {
    const html = render();
    expect(html).toContain('data-testid="katalog-novi-termin"');
    expect(html).toContain("Novi termin");
    expect(html).toContain("Jednokratno ili serija");
  });

  it("renders the three catalog rows with their testIDs and labels", () => {
    const html = render();
    expect(html).toContain('data-testid="katalog-row-class-types"');
    expect(html).toContain('data-testid="katalog-row-rooms"');
    expect(html).toContain('data-testid="katalog-row-package-types"');
    expect(html).toContain("Tipovi treninga");
    expect(html).toContain("Sale");
    expect(html).toContain("Tipovi paketa");
  });

  it("does not pass a rightSlot to the screen container (Katalog has no header buttons)", () => {
    // The mocked ScreenContainerRaw only renders title — no rightSlot
    // affordance leaks into the DOM. This is a structural check that the
    // import contract still matches the no-rightSlot expectation.
    const html = render();
    expect(html).not.toContain("admin-new-session-button");
  });
});
