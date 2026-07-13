import { describe, expect, it } from "vitest";
import { findSimilarClassTypeName } from "@/lib/admin/class-type-name-similarity";

describe("findSimilarClassTypeName", () => {
  it("flags names that differ only by a session-count digit (the staging incident)", () => {
    expect(
      findSimilarClassTypeName("Reformer pilates 8", ["Reformer pilates 12"]),
    ).toBe("Reformer pilates 12");
  });

  it("flags a digit-suffixed variant of an existing clean name", () => {
    expect(
      findSimilarClassTypeName("Reformer pilates 8", ["Reformer pilates"]),
    ).toBe("Reformer pilates");
  });

  it("flags containment either way after normalization", () => {
    expect(findSimilarClassTypeName("Reformer", ["Reformer pilates"])).toBe(
      "Reformer pilates",
    );
    expect(
      findSimilarClassTypeName("Reformer pilates napredni", ["Reformer pilates"]),
    ).toBe("Reformer pilates");
  });

  it("ignores case and extra whitespace", () => {
    expect(
      findSimilarClassTypeName("  reformer   PILATES ", ["Reformer pilates"]),
    ).toBe("Reformer pilates");
  });

  it("does not flag genuinely different class types", () => {
    expect(
      findSimilarClassTypeName("Energy pilates", ["Reformer pilates", "Moms&Minis"]),
    ).toBeNull();
  });

  it("returns null for an empty or digits-only candidate", () => {
    expect(findSimilarClassTypeName("", ["Reformer pilates"])).toBeNull();
    expect(findSimilarClassTypeName("12", ["Reformer pilates"])).toBeNull();
  });

  it("returns the first similar existing name verbatim for display", () => {
    expect(
      findSimilarClassTypeName("Golden age 4", [
        "Energy pilates",
        "Golden age pilates",
      ]),
    ).toBe("Golden age pilates");
  });
});
