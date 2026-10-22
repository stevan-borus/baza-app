/**
 * A day-view session block must emit the same border-width keys whether or
 * not it is hidden from clients.
 *
 * On Fabric Android a prop removed from a mounted view resets to its default,
 * and border widths default to NaN. Publishing a hidden session keeps its
 * block mounted; dropping the dashed outline's top/right/bottom widths
 * produced a NaN padding box that, with `overflow: "hidden"`, clipped the
 * block's title, time and badges.
 */
import { describe, it, expect } from "vitest";
import { sessionBlockStyle } from "@/components/ui/session-block-style";

const SPINE = "#2e5b42";
const MUTED = "#8a8a8a";

const states = [true, false] as const;

describe("sessionBlockStyle", () => {
  it("returns the same key set hidden and visible", () => {
    const [hidden, visible] = states.map((h) =>
      Object.keys(sessionBlockStyle(h, SPINE, MUTED)).sort(),
    );
    expect(hidden).toEqual(visible);
    expect(hidden).toEqual(
      expect.arrayContaining([
        "borderLeftWidth",
        "borderTopWidth",
        "borderRightWidth",
        "borderBottomWidth",
      ]),
    );
  });

  it("gives every width a finite number", () => {
    for (const h of states) {
      const style = sessionBlockStyle(h, SPINE, MUTED);
      for (const [key, value] of Object.entries(style)) {
        if (key.endsWith("Width")) expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it("draws a hidden session with a dashed muted outline, faded", () => {
    expect(sessionBlockStyle(true, SPINE, MUTED)).toMatchObject({
      borderLeftWidth: 4,
      borderLeftColor: SPINE,
      borderTopWidth: 1,
      borderRightWidth: 1,
      borderBottomWidth: 1,
      borderStyle: "dashed",
      borderColor: MUTED,
      opacity: 0.6,
    });
  });

  it("draws a visible session with only the spine, fully opaque", () => {
    expect(sessionBlockStyle(false, SPINE, MUTED)).toMatchObject({
      borderLeftWidth: 4,
      borderLeftColor: SPINE,
      borderTopWidth: 0,
      borderRightWidth: 0,
      borderBottomWidth: 0,
      borderStyle: "solid",
      opacity: 1,
    });
  });
});
