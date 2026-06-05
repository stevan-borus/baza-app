import { describe, expect, it } from "vitest";
import { formatRsd } from "@/lib/format";

describe("formatRsd", () => {
  it("formats with sr-RS grouping and a ' RSD' suffix", () => {
    // sr-RS groups thousands with a dot.
    expect(formatRsd(12000)).toBe("12.000 RSD");
    expect(formatRsd(9000)).toBe("9.000 RSD");
  });

  it("rounds to a whole number (no fractional dinars)", () => {
    expect(formatRsd(12000.4)).toBe("12.000 RSD");
    expect(formatRsd(12000.6)).toBe("12.001 RSD");
  });

  it("handles zero", () => {
    expect(formatRsd(0)).toBe("0 RSD");
  });
});
