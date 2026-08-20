import { afterEach, describe, expect, it } from "vitest";
import i18n from "@/lib/i18n";

/**
 * "+2 posebna" was not Serbian, and a bare adjective is not a phrase:
 * procenat is masculine, so the chip now carries the noun it counts.
 *
 * The override chip counts a trainer's special rates, and Serbian needs three
 * forms for that count — 1 posebni procenat, 2-4 posebna procenta,
 * 5+ posebnih procenata — the way the
 * rest of the app's counted strings already do. A single hardcoded form reads
 * as broken copy to every native speaker who opens the roster.
 */
describe("payroll.overridesHint plurals", () => {
  afterEach(async () => {
    await i18n.changeLanguage("sr");
  });

  it("declines the Serbian chip for one, few and many", async () => {
    await i18n.changeLanguage("sr");
    expect(i18n.t("payroll.overridesHint", { count: 1 })).toBe("+1 posebni procenat");
    expect(i18n.t("payroll.overridesHint", { count: 2 })).toBe("+2 posebna procenta");
    expect(i18n.t("payroll.overridesHint", { count: 4 })).toBe("+4 posebna procenta");
    expect(i18n.t("payroll.overridesHint", { count: 5 })).toBe("+5 posebnih procenata");
    expect(i18n.t("payroll.overridesHint", { count: 11 })).toBe("+11 posebnih procenata");
  });

  it("declines the Serbian a11y label for one, few and many", async () => {
    await i18n.changeLanguage("sr");
    expect(i18n.t("payroll.overridesHintA11y", { count: 1 })).toBe(
      "1 poseban procenat",
    );
    expect(i18n.t("payroll.overridesHintA11y", { count: 2 })).toBe(
      "2 posebna procenta",
    );
    expect(i18n.t("payroll.overridesHintA11y", { count: 5 })).toBe(
      "5 posebnih procenata",
    );
  });

  it("keeps English to its two forms", async () => {
    await i18n.changeLanguage("en");
    expect(i18n.t("payroll.overridesHint", { count: 1 })).toBe("+1 special rate");
    expect(i18n.t("payroll.overridesHint", { count: 3 })).toBe("+3 special rates");
    expect(i18n.t("payroll.overridesHintA11y", { count: 1 })).toBe(
      "1 special percentage",
    );
    expect(i18n.t("payroll.overridesHintA11y", { count: 3 })).toBe(
      "3 special percentages",
    );
  });
});
