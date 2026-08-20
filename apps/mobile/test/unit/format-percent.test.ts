import { afterEach, describe, expect, it } from "vitest";
import { formatPercent } from "@/lib/format";
import i18n from "@/lib/i18n";

/**
 * Rendering a commission percentage.
 *
 * Rates carry one decimal place now — a trainer moving 22% to 22.5% was
 * unrepresentable before — but the overwhelming majority are still whole
 * points, and "35.0%" on every row would be noise dressed as precision. So a
 * whole percent renders whole, and only a half point spends the extra glyph.
 *
 * The separator follows the UI language, the way every other number in the app
 * does: Serbian writes 22,5 and English writes 22.5.
 */
describe("formatPercent", () => {
  afterEach(async () => {
    await i18n.changeLanguage("sr");
  });

  it("renders a whole percent without a decimal", () => {
    expect(formatPercent(35)).toBe("35%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(100)).toBe("100%");
  });

  it("renders one decimal with the Serbian comma", () => {
    expect(formatPercent(22.5)).toBe("22,5%");
  });

  it("renders one decimal with a dot in English", async () => {
    await i18n.changeLanguage("en");
    expect(formatPercent(22.5)).toBe("22.5%");
    // Whole percents stay whole in either language.
    expect(formatPercent(35)).toBe("35%");
  });
});
