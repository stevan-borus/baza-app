import { describe, expect, it } from "vitest";
import { formatClassTypeList } from "@/lib/format";

describe("formatClassTypeList", () => {
  it("joins up to two names with the middle dot", () => {
    expect(formatClassTypeList(["Reformer pilates"])).toBe("Reformer pilates");
    expect(formatClassTypeList(["Reformer pilates", "Energy pilates"])).toBe(
      "Reformer pilates · Energy pilates",
    );
  });

  it("collapses a long covered set into two names plus an overflow count", () => {
    expect(
      formatClassTypeList([
        "Reformer pilates",
        "Energy pilates",
        "Moms&Minis",
        "Golden age",
        "Yoga flow",
      ]),
    ).toBe("Reformer pilates · Energy pilates +3");
  });

  it("returns an empty string for an empty set", () => {
    expect(formatClassTypeList([])).toBe("");
  });
});
