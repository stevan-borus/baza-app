/**
 * The marketing-consent step at sign-up.
 *
 * ZZPL Art. 15 requires a consent request bundled with other matters to be
 * presented so it is distinguishable from them, so this cannot be one more
 * switch in the documents card. ZZPL Art. 4(1)(12) requires a clear
 * affirmative action, so nothing may start selected.
 *
 * Real Chromium + the shipped sr/en copy + a real seeded QueryClient.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { fireEvent } from "@testing-library/react";
import React from "react";
import i18n from "@/lib/i18n";
import { renderWithQueryClient } from "./helpers";
import { MarketingConsentQuestion } from "@/components/consent/marketing-consent-question";

describe("marketing consent question", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("sr");
  });

  it("starts with neither Da nor Ne selected — silence is not consent", () => {
    const screen = renderWithQueryClient(
      <MarketingConsentQuestion value={null} onChange={() => {}} />,
    );

    expect(
      screen.getByTestId("marketing-consent-yes").getAttribute("aria-checked"),
    ).toBe("false");
    expect(
      screen.getByTestId("marketing-consent-no").getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("renders as its own card, separate from the documents card", () => {
    const screen = renderWithQueryClient(
      <MarketingConsentQuestion value={null} onChange={() => {}} />,
    );

    expect(screen.getByTestId("marketing-consent-question")).toBeTruthy();
  });

  it("shows the shipped Serbian copy naming email marketing explicitly", () => {
    const screen = renderWithQueryClient(
      <MarketingConsentQuestion value={null} onChange={() => {}} />,
    );

    const text = screen.getByTestId("marketing-consent-question").textContent ?? "";
    expect(text).toContain("Promocije i novi programi");
    expect(text).toContain("imejlom");
    expect(text).toContain("Da");
    expect(text).toContain("Ne");
    // Art. 63 of the Law on Advertising: withdrawal available at any moment.
    expect(text).toContain("u svakom trenutku");
  });

  it("shows the English copy under the en locale", async () => {
    await i18n.changeLanguage("en");
    const screen = renderWithQueryClient(
      <MarketingConsentQuestion value={null} onChange={() => {}} />,
    );

    const text = screen.getByTestId("marketing-consent-question").textContent ?? "";
    expect(text).toContain("Promotions and new programs");
    expect(text).toContain("email");
  });

  it("reports the chosen answer without pre-selecting either", () => {
    const chosen: boolean[] = [];
    const screen = renderWithQueryClient(
      <MarketingConsentQuestion
        value={null}
        onChange={(next) => chosen.push(next)}
      />,
    );

    fireEvent.click(screen.getByTestId("marketing-consent-yes"));
    expect(chosen).toEqual([true]);

    fireEvent.click(screen.getByTestId("marketing-consent-no"));
    expect(chosen).toEqual([true, false]);
  });

  it("marks the selected choice once a value is supplied", () => {
    const screen = renderWithQueryClient(
      <MarketingConsentQuestion value={false} onChange={() => {}} />,
    );

    expect(
      screen.getByTestId("marketing-consent-no").getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen.getByTestId("marketing-consent-yes").getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("exposes an accessibility label on each choice", () => {
    const screen = renderWithQueryClient(
      <MarketingConsentQuestion value={null} onChange={() => {}} />,
    );

    expect(
      screen.getByTestId("marketing-consent-yes").getAttribute("aria-label"),
    ).toBe(i18n.t("consent.marketing.acceptA11y"));
    expect(
      screen.getByTestId("marketing-consent-no").getAttribute("aria-label"),
    ).toBe(i18n.t("consent.marketing.declineA11y"));
  });

  it("disables both choices while a save is in flight", () => {
    const screen = renderWithQueryClient(
      <MarketingConsentQuestion value={null} onChange={() => {}} disabled />,
    );

    expect(
      screen.getByTestId("marketing-consent-yes").getAttribute("aria-disabled"),
    ).toBe("true");
  });
});
