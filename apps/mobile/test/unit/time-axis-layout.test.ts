import { describe, expect, it } from "vitest";
import { layoutSessions } from "@/components/ui/time-axis-layout";

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
