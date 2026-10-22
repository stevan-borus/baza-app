/**
 * GlassCard must emit the same border-width keys in every accent state.
 *
 * On Fabric Android a prop removed from a mounted view resets to its default,
 * and border widths default to NaN. A notification row toggles `accentBorder`
 * from "left" to undefined when it is marked read; dropping `borderLeftWidth`
 * produced a NaN padding box that, with `overflow: "hidden"`, clipped every
 * child and left an empty card.
 */
import { describe, it, expect } from "vitest";
import { glassCardEdgeStyle } from "@/components/ui/glass-card-edge-style";

const ACCENT = "#2e5b42";
const BASE = "rgba(255,255,255,0.1)";

const states = ["left", "top", undefined] as const;

describe("glassCardEdgeStyle", () => {
  it("returns the same key set for every accent state", () => {
    const keySets = states.map((s) =>
      Object.keys(glassCardEdgeStyle(s, ACCENT, BASE)).sort(),
    );
    expect(keySets[0]).toEqual(keySets[1]);
    expect(keySets[0]).toEqual(keySets[2]);
    expect(keySets[0]).toEqual(
      expect.arrayContaining(["borderLeftWidth", "borderTopWidth"]),
    );
  });

  it("gives every width a finite number", () => {
    for (const s of states) {
      const style = glassCardEdgeStyle(s, ACCENT, BASE);
      for (const [key, value] of Object.entries(style)) {
        if (key.endsWith("Width")) expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it("draws the left accent 3 wide in the accent color", () => {
    expect(glassCardEdgeStyle("left", ACCENT, BASE)).toMatchObject({
      borderLeftWidth: 3,
      borderLeftColor: ACCENT,
      borderTopWidth: 1,
      borderTopColor: BASE,
    });
  });

  it("draws the top accent 3 wide in the accent color", () => {
    expect(glassCardEdgeStyle("top", ACCENT, BASE)).toMatchObject({
      borderLeftWidth: 1,
      borderLeftColor: BASE,
      borderTopWidth: 3,
      borderTopColor: ACCENT,
    });
  });

  it("keeps both edges at the base border without an accent", () => {
    expect(glassCardEdgeStyle(undefined, ACCENT, BASE)).toMatchObject({
      borderLeftWidth: 1,
      borderLeftColor: BASE,
      borderTopWidth: 1,
      borderTopColor: BASE,
    });
  });
});
