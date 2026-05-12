/**
 * Izveštaji landing screen structural tests.
 *
 * The Izveštaji landing is a 4-card hub (Prihod / Iskorišćenost / Rezervacije
 * / Paketi) sitting above a period segmented-control. The redesign in this
 * PR (1) drops "Nedelja" from the segment list so the remaining 4 chips fit
 * on narrow iPhones without wrapping, and (2) replaces the 2×2 GlassCard
 * grid with bordered squares that drop the icon-top-right + chevron-bottom
 * pair (duplicate affordance) in favour of numerals-as-the-hero. The press
 * affordance is the whole card.
 *
 * These tests run the screen through react-dom/server with react-native
 * mocked to plain HTML so we can assert on testIDs, rendered text, and
 * the style props that carry the new visual contract (aspectRatio, no
 * chevron, no icon).
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
          "data-style-json":
            style != null ? JSON.stringify(style) : undefined,
        },
        children,
      ),
    Text: ({ children, style, className, testID, numberOfLines: _n, adjustsFontSizeToFit: _a, ...p }: any) =>
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
    Pressable: ({ children, onPress: _o, testID, className, style, ...p }: any) =>
      RR.createElement(
        "button",
        {
          ...p,
          "data-testid": testID,
          "data-class": className,
          style: typeof style === "object" ? style : undefined,
          "data-style-json":
            style != null ? JSON.stringify(style) : undefined,
        },
        children,
      ),
    ScrollView: ({ children, contentContainerStyle: _c, refreshControl: _r, ...p }: any) =>
      RR.createElement("div", { ...p }, children),
    RefreshControl: () => null,
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
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  router: { push: vi.fn() },
}));
vi.mock("@tanstack/react-query", () => {
  // Minimal stub returning isLoading:false + empty data so the landing
  // renders the placeholder em-dashes for each card.
  return {
    useQuery: () => ({ data: undefined, isLoading: false, isError: false }),
    useQueryClient: () => ({ invalidateQueries: () => Promise.resolve() }),
  };
});
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string) => {
      const map: Record<string, string> = {
        "tabs.reports": "Izveštaji",
        "admin.manage.periodWeek": "Nedelja",
        "admin.manage.periodMonth": "Mesec",
        "admin.manage.periodQuarter": "Kvartal",
        "admin.manage.periodYear": "Godina",
        "admin.manage.periodAll": "Sve vreme",
        "admin.izvestaji.sections.prihod": "Prihod",
        "admin.izvestaji.sections.iskoriscenost": "Iskorišćenost",
        "admin.izvestaji.sections.rezervacije": "Rezervacije",
        "admin.izvestaji.sections.paketi": "Paketi",
        "admin.izvestaji.headlines.prihodSub": "Ukupan prihod",
        "admin.izvestaji.headlines.iskoriscenostSub": "Iskorišćenost",
        "admin.izvestaji.headlines.rezervacijeSub": "Rezervacije",
        "admin.izvestaji.headlines.paketiSub": "Aktivni klijenti",
        "admin.izvestaji.cardUnits.rsd": "RSD",
        "admin.izvestaji.cardUnits.percent": "%",
        "admin.izvestaji.cardUnits.sessions": "termina",
        "admin.izvestaji.cardUnits.clients": "klijenata",
        "admin.manage.reportsError": "Greška",
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
vi.mock("@/components/ui/styled", () => ({
  MotiView: ({ children }: any) =>
    require("react").createElement("div", null, children),
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
vi.mock("@/components/ui/segmented-control", () => ({
  SegmentedControl: ({ options, segments }: any) => {
    const list = options ?? segments ?? [];
    return require("react").createElement(
      "div",
      { "data-testid": "segmented-control" },
      list.map((s: any) =>
        require("react").createElement(
          "span",
          {
            key: s.value,
            "data-testid": `segment-${s.value}`,
            "data-label": s.label,
          },
          s.label,
        ),
      ),
    );
  },
}));
vi.mock("@/components/ui/states", () => ({
  ErrorState: () => null,
}));
vi.mock("@/components/ui/glass-card", () => ({
  GlassCard: ({ children }: any) =>
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
vi.mock("@/components/ui/number-rollup", () => ({
  NumberRollup: ({ value, formatter }: any) =>
    require("react").createElement(
      "span",
      { "data-testid": "number-rollup" },
      formatter ? formatter(value) : String(value),
    ),
}));
vi.mock("@/lib/queries/reports-queries-factory", () => ({
  reportsQueries: {
    summary: () => ({ queryKey: ["reports", "summary"], queryFn: () => null }),
    utilization: () => ({ queryKey: ["reports", "utilization"], queryFn: () => null }),
  },
}));
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));

import IzvestajiLanding from "@/app/(admin)/izvestaji/index";

function render() {
  return renderToStaticMarkup(React.createElement(IzvestajiLanding));
}

describe("Izveštaji landing — period selector", () => {
  it("does not include a 'week' segment (Nedelja was dropped to avoid pill wrap)", () => {
    const html = render();
    expect(html).not.toContain('data-testid="segment-week"');
    expect(html).not.toContain("Nedelja");
  });

  it("renders exactly 4 segments — Mesec, Kvartal, Godina, Sve vreme", () => {
    const html = render();
    expect(html).toContain('data-testid="segment-month"');
    expect(html).toContain('data-testid="segment-quarter"');
    expect(html).toContain('data-testid="segment-year"');
    expect(html).toContain('data-testid="segment-all"');
    // Count segment-* occurrences. There should be exactly 4.
    const matches = html.match(/data-testid="segment-/g) ?? [];
    expect(matches.length).toBe(4);
  });
});

describe("Izveštaji landing — card grid", () => {
  it("renders all 4 cards with their testIDs preserved", () => {
    const html = render();
    expect(html).toContain('data-testid="izvestaji-card-prihod"');
    expect(html).toContain('data-testid="izvestaji-card-iskoriscenost"');
    expect(html).toContain('data-testid="izvestaji-card-rezervacije"');
    expect(html).toContain('data-testid="izvestaji-card-paketi"');
  });

  it("applies aspectRatio: 1 to each card so all four are equal squares", () => {
    const html = render();
    // Each Pressable card should carry an aspectRatio: 1 style entry. The
    // exact serialisation depends on how style flows through Pressable, so
    // assert the JSON snapshot contains the key/value pair on all four
    // cards.
    const aspectMatches = html.match(/"aspectRatio":1/g) ?? [];
    expect(aspectMatches.length).toBeGreaterThanOrEqual(4);
  });

  it("drops the chevron-right icon from each card (the whole card is pressable)", () => {
    const html = render();
    expect(html).not.toContain('data-icon="chevron-right"');
  });

  it("drops the top-right icon (trending-up, pie-chart, calendar, package) from each card", () => {
    const html = render();
    expect(html).not.toContain('data-icon="trending-up"');
    expect(html).not.toContain('data-icon="pie-chart"');
    expect(html).not.toContain('data-icon="calendar"');
    expect(html).not.toContain('data-icon="package"');
  });

  it("renders the 4 caps-overline section labels", () => {
    const html = render();
    expect(html).toContain("Prihod");
    expect(html).toContain("Iskorišćenost");
    expect(html).toContain("Rezervacije");
    expect(html).toContain("Paketi");
  });
});
