import { describe, expect, it } from "vitest";
import {
  layoutSessions,
  tintBg,
  tintText,
} from "@/components/ui/time-axis-layout";

/**
 * layoutSessions assigns each session a column index + the number of columns
 * in its overlap group, so concurrent sessions render side-by-side instead of
 * stacking on top of each other. Pure function — no rendering.
 */
const S = (id: string, start: string, end: string) => ({
  id,
  startsAt: `2026-06-03T${start}:00`,
  endsAt: `2026-06-03T${end}:00`,
});

describe("layoutSessions", () => {
  it("gives a lone session a single full-width column", () => {
    const out = layoutSessions([S("a", "10:00", "11:00")]);
    expect(out).toEqual([{ id: "a", col: 0, cols: 1 }]);
  });

  it("keeps sequential, non-overlapping sessions all at 1 column", () => {
    const out = layoutSessions([
      S("a", "06:30", "07:30"),
      S("b", "07:30", "08:30"),
    ]);
    // Touching at the boundary (a ends exactly when b starts) is NOT an overlap.
    expect(out.find((x) => x.id === "a")).toEqual({ id: "a", col: 0, cols: 1 });
    expect(out.find((x) => x.id === "b")).toEqual({ id: "b", col: 0, cols: 1 });
  });

  it("splits two truly-concurrent sessions into 2 columns", () => {
    const out = layoutSessions([
      S("a", "10:00", "11:00"),
      S("b", "10:00", "11:00"),
    ]);
    expect(out.every((x) => x.cols === 2)).toBe(true);
    expect(out.map((x) => x.col).sort()).toEqual([0, 1]);
  });

  it("partial overlap still produces 2 columns for the overlapping pair", () => {
    const out = layoutSessions([
      S("a", "10:00", "11:00"),
      S("b", "10:30", "11:30"),
    ]);
    expect(out.find((x) => x.id === "a")?.cols).toBe(2);
    expect(out.find((x) => x.id === "b")?.cols).toBe(2);
    expect([out.find((x) => x.id === "a")?.col, out.find((x) => x.id === "b")?.col].sort()).toEqual([0, 1]);
  });

  it("isolates non-overlapping groups (a|b overlap, c alone)", () => {
    const out = layoutSessions([
      S("a", "10:00", "11:00"),
      S("b", "10:00", "11:00"),
      S("c", "12:00", "13:00"),
    ]);
    expect(out.find((x) => x.id === "c")).toEqual({ id: "c", col: 0, cols: 1 });
    expect(out.find((x) => x.id === "a")?.cols).toBe(2);
    expect(out.find((x) => x.id === "b")?.cols).toBe(2);
  });
});

describe("tintBg", () => {
  // The whole point of blending over the canvas: an OPAQUE fill. A translucent
  // wash let the hour grid line underneath show through any block spanning an
  // hour boundary (06:30–07:30 crosses the 07:00 line) — the bug we fixed.
  it("returns an opaque rgb() with no alpha channel", () => {
    const fill = tintBg("#2e5b42", "#F4EFE3");
    expect(fill).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    expect(fill).not.toContain("rgba");
  });

  it("blends toward the class color but stays close to the background at low ratio", () => {
    // ratio 0.12 over the cream canvas → each channel mostly the canvas value.
    expect(tintBg("#2e5b42", "#F4EFE3", 0.12)).toBe("rgb(220, 221, 208)");
  });

  it("re-tints over a dark canvas so the fill works in dark mode", () => {
    const light = tintBg("#2e5b42", "#F4EFE3");
    const dark = tintBg("#2e5b42", "#1A1A1C");
    expect(light).not.toBe(dark);
  });

  it("returns the pure background when ratio is 0", () => {
    expect(tintBg("#2e5b42", "#F4EFE3", 0)).toBe("rgb(244, 239, 227)");
  });
});

describe("tintText", () => {
  // The secondary line sits ON the tinted block, so it can't use the page's
  // `muted` grey — that washed out on the green fill. tintText starts from the
  // theme foreground and pulls it toward the class color: dark green on a light
  // fill, light green on a dark fill, legible either way.
  it("produces a dark green from the light-mode (near-black) foreground", () => {
    expect(tintText("#2e5b42", "#0F0F0D")).toBe("rgb(26, 42, 32)");
  });

  it("produces a light green from the dark-mode (near-white) foreground", () => {
    const dark = tintText("#2e5b42", "#EDE8DC");
    expect(dark).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    // Each channel stays bright (close to the near-white foreground) so it
    // reads against the dark-mode fill, unlike the light-mode result above.
    expect(dark).not.toBe(tintText("#2e5b42", "#0F0F0D"));
  });

  it("returns the pure foreground when ratio is 0", () => {
    expect(tintText("#2e5b42", "#0F0F0D", 0)).toBe("rgb(15, 15, 13)");
  });
});
