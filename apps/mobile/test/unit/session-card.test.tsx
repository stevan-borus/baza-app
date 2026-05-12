/**
 * SessionCard structural tests.
 *
 * Renders the component via react-dom/server with `react-native` mocked to
 * lightweight HTML primitives — that's enough to assert on the rendered
 * tree (text, testIDs, class names, inline styles) which is all the
 * editorial-slot redesign changes.
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
          style: typeof style === "object" && !Array.isArray(style) ? style : undefined,
        },
        children,
      ),
    Text: ({ children, style, className, numberOfLines: _n, ...p }: any) =>
      RR.createElement(
        "span",
        { ...p, "data-class": className, style: typeof style === "object" ? style : undefined },
        children,
      ),
    Pressable: ({ children, onPress: _o, testID, className, ...p }: any) =>
      RR.createElement(
        "button",
        { ...p, "data-testid": testID, "data-class": className },
        children,
      ),
    Platform: { OS: "web" },
  };
});

vi.mock("expo-blur", () => ({ BlurView: () => null }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, o?: { count?: number }) =>
      o && typeof o.count === "number" ? `${k}=${o.count}` : k,
  }),
}));
vi.mock("@/components/ui/tokens", () => ({
  useThemeTokens: () => ({
    glass: "rgba(0,0,0,0.04)",
    glassAndroid: "rgba(255,255,255,0.95)",
    glassBorder: "rgba(0,0,0,0.10)",
  }),
}));
vi.mock("@/lib/theme-preference", () => ({
  useThemePreference: () => ({ resolvedTheme: "dark" }),
}));

import { SessionCard } from "@/components/ui/session-card";

function render(props: Partial<React.ComponentProps<typeof SessionCard>> = {}) {
  const defaults: React.ComponentProps<typeof SessionCard> = {
    time: "10:00 - 11:00",
    className: "Reformer pilates",
    trainerName: "Trainer Reformer Lead",
    room: "Sala 1",
    bookedCount: 5,
    capacity: 10,
    status: "available",
    sessionId: "s1",
  };
  return renderToStaticMarkup(
    React.createElement(SessionCard, { ...defaults, ...props }),
  );
}

describe("SessionCard — editorial slot layout", () => {
  it("never renders the legacy 'X spots' / 'X spot' badge text", () => {
    const html = render({ bookedCount: 5, capacity: 10 });
    expect(html).not.toMatch(/\b\d+\s+spots?\b/i);
  });

  it("does not indent the room name with the legacy pl-[78px] hack", () => {
    const html = render({ room: "Sala 1" });
    expect(html).toContain("Sala 1");
    // The whole HTML must not contain pl-[78px] anymore — the room is
    // a normal row inside the middle column.
    expect(html).not.toContain("pl-[78px]");
  });

  it("renders the room name in the same column as className and trainer", () => {
    const html = render({
      className: "Reformer pilates",
      trainerName: "Trainer Reformer Lead",
      room: "Sala 1",
    });
    // All three labels are present.
    expect(html).toContain("Reformer pilates");
    expect(html).toContain("Trainer Reformer Lead");
    expect(html).toContain("Sala 1");
  });

  it("renders a capacity bar with the correct filled percentage", () => {
    const html = render({ bookedCount: 5, capacity: 10, sessionId: "s1" });
    expect(html).toContain('data-testid="session-card-capacity-bar-s1"');
    // 5/10 = 50%
    expect(html).toMatch(/width:50%/);
  });

  it("renders a full capacity bar when bookedCount equals capacity", () => {
    const html = render({ bookedCount: 7, capacity: 7, sessionId: "full" });
    expect(html).toContain('data-testid="session-card-capacity-bar-full"');
    expect(html).toMatch(/width:100%/);
  });

  it("renders a full capacity bar when bookedCount exceeds capacity", () => {
    const html = render({ bookedCount: 9, capacity: 7, sessionId: "over" });
    expect(html).toMatch(/width:100%/);
  });

  it("renders an empty capacity bar when nothing is booked", () => {
    const html = render({ bookedCount: 0, capacity: 8, sessionId: "empty" });
    expect(html).toContain('data-testid="session-card-capacity-bar-empty"');
    expect(html).toMatch(/width:0%/);
  });

  it("renders no capacity bar when capacity is 0", () => {
    const html = render({ bookedCount: 0, capacity: 0, sessionId: "noop" });
    expect(html).not.toContain("session-card-capacity-bar-noop");
  });

  it("uses fallback capacity bar testID when no sessionId is provided", () => {
    const html = render({ bookedCount: 1, capacity: 2, sessionId: undefined });
    expect(html).toContain('data-testid="session-card-capacity-bar"');
  });

  it("renders the hidden 'SKRIVENO' caps-overline inline (not as a right-side badge)", () => {
    const html = render({ hidden: true, hiddenLabel: "SKRIVENO" });
    expect(html).toContain("SKRIVENO");
    // The 'SKRIVENO' label appears after the room name (middle column),
    // before the capacity bar. There is no Badge wrapper rendering it
    // off to the right anymore.
    const skrivenoIdx = html.indexOf("SKRIVENO");
    const roomIdx = html.indexOf("Sala 1");
    expect(roomIdx).toBeGreaterThan(-1);
    expect(skrivenoIdx).toBeGreaterThan(roomIdx);
  });

  it("renders the time block with the 28pt headline style", () => {
    const html = render({ time: "10:00 - 11:00" });
    expect(html).toContain("10:00");
    expect(html).toContain("11:00");
    // 28pt headline numerals; the only span carrying fontSize:28 in this
    // tree is the time block.
    expect(html).toMatch(/font-size:28/);
  });
});
