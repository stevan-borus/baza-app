/**
 * NumberRollup first-render behavior tests.
 *
 * The rollup previously initialized its display with 0 and animated *every*
 * value change — including the first one. When a parent mounted the rollup
 * with `value={5}` before the query resolved (and then later updated to a
 * larger number), the on-screen counter would visibly spike from 0 up
 * past the target. Even worse, if the parent's data resolved by mounting
 * the rollup with the final value directly, the rollup would still animate
 * from 0 → target on first render — a placeholder peak users see and
 * misread.
 *
 * Fix: skip animation on first render. The initial value is rendered
 * statically; only subsequent prop changes animate.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("react-native", () => {
  const RR = require("react");
  return {
    Text: ({ children, className, style, ...p }: any) =>
      RR.createElement(
        "span",
        {
          ...p,
          "data-class": className,
          style: typeof style === "object" ? style : undefined,
        },
        children,
      ),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("NumberRollup — first render does not animate", () => {
  it("renders the initial value statically on mount (no 0-to-N spike)", async () => {
    const { NumberRollup } = await import("@/components/ui/number-rollup");
    const html = renderToStaticMarkup(
      React.createElement(NumberRollup, { value: 5 }),
    );
    // The displayed text must be the exact formatted target on the first
    // render — NOT the legacy "0" placeholder that the old version showed
    // before the requestAnimationFrame step kicked in.
    expect(html).toContain(">5<");
    expect(html).not.toContain(">0<");
  });

  it("respects the formatter on first render (no raw 0 leaking through)", async () => {
    const { NumberRollup } = await import("@/components/ui/number-rollup");
    const html = renderToStaticMarkup(
      React.createElement(NumberRollup, {
        value: 37000,
        formatter: (n: number) =>
          `${Math.round(n).toLocaleString("sr-RS")} RSD`,
      }),
    );
    // Server-render only triggers useState's initializer — not useEffect.
    // The fix means the initializer seeds with `value`, not 0.
    expect(html).toMatch(/37[\.,\s]?000\s*RSD/);
    expect(html).not.toContain(">0 RSD<");
  });

  it("renders large numbers immediately without showing a placeholder zero", async () => {
    const { NumberRollup } = await import("@/components/ui/number-rollup");
    const html = renderToStaticMarkup(
      React.createElement(NumberRollup, { value: 42 }),
    );
    expect(html).toContain(">42<");
    expect(html).not.toContain(">0<");
  });
});
