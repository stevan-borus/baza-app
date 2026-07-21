import i18n from "i18next";
import { beforeAll, describe, expect, it } from "vitest";
import en from "@/locales/en.json";
import sr from "@/locales/sr.json";

// The countdown copy is plural-sensitive and Serbian needs three forms.
// Rendering "još 1 dana" or "1 days left" in front of a paying client is
// the kind of small wrongness that reads as an unfinished app, so the
// forms are pinned here against the REAL resource bundles.
describe("package expiry countdown copy", () => {
  beforeAll(async () => {
    await i18n.init({
      resources: { sr: { translation: sr }, en: { translation: en } },
      lng: "sr",
      fallbackLng: "sr",
      supportedLngs: ["sr", "en"],
      interpolation: { escapeValue: false },
      compatibilityJSON: "v4",
    });
  });

  const key = "client.home.expiresWithCountdown";

  it("uses the singular form for one day in Serbian", () => {
    expect(i18n.t(key, { lng: "sr", date: "23. jul", count: 1 })).toBe(
      "Ističe 23. jul · još 1 dan",
    );
  });

  it("uses the paucal (few) form for 2-4 days in Serbian", () => {
    expect(i18n.t(key, { lng: "sr", date: "23. jul", count: 3 })).toBe(
      "Ističe 23. jul · još 3 dana",
    );
  });

  it("uses the plural form for 5+ days in Serbian", () => {
    expect(i18n.t(key, { lng: "sr", date: "23. jul", count: 7 })).toBe(
      "Ističe 23. jul · još 7 dana",
    );
  });

  it("uses singular and plural correctly in English", () => {
    expect(i18n.t(key, { lng: "en", date: "23 July", count: 1 })).toBe(
      "Expires 23 July · 1 day left",
    );
    expect(i18n.t(key, { lng: "en", date: "23 July", count: 2 })).toBe(
      "Expires 23 July · 2 days left",
    );
  });

  it("has a distinct last-day string in both locales", () => {
    // 0 days left is still a usable day - "0 days left" would be a lie.
    expect(i18n.t("client.home.expiresToday", { lng: "sr" })).toBe(
      "Ističe danas · poslednji dan za zakazivanje",
    );
    expect(i18n.t("client.home.expiresToday", { lng: "en" })).toBe(
      "Expires today · last day to book",
    );
  });
});
