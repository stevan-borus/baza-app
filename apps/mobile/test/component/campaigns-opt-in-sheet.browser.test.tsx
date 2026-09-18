/**
 * CampaignsOptInSheet — real Chromium, real RNW, real i18n with the shipped
 * Serbian copy, a real seeded QueryClient.
 *
 * The prompt exists because Serbia requires marketing opt-IN: nobody is ever
 * asked, so campaignsEnabled stays false forever. Both answers must close the
 * sheet and mark it seen; only "Uključi" may flip the preference.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import i18n from "@/lib/i18n";
import { renderWithQueryClient } from "./helpers";
import { CampaignsOptInSheet } from "@/components/notifications/campaigns-opt-in-sheet";
import { notificationsQueries } from "@/lib/queries/notifications-queries-factory";

const preferencesKey = notificationsQueries.preferences().queryKey;

function seedPreferences(client: QueryClient) {
  client.setQueryData(preferencesKey, {
    success: true,
    preferences: {
      pushEnabled: true,
      inAppEnabled: true,
      campaignsEnabled: false,
      bookingEmailsEnabled: true,
      preferredLocale: "sr",
    },
  });
}

/** Serves the preferences PATCH and records every body it was handed. */
function stubPreferencesEndpoint() {
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      bodies.push(body);
      return new Response(
        JSON.stringify({
          success: true,
          preferences: {
            pushEnabled: true,
            inAppEnabled: true,
            campaignsEnabled: true,
            bookingEmailsEnabled: true,
            preferredLocale: "sr",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }),
  );
  return bodies;
}

describe("campaigns opt-in sheet", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("sr");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the shipped Serbian copy", () => {
    stubPreferencesEndpoint();
    const screen = renderWithQueryClient(
      <CampaignsOptInSheet open onOpenChange={() => {}} onSeen={() => {}} />,
      seedPreferences,
    );

    const text = screen.getByTestId("campaigns-opt-in-sheet").textContent ?? "";
    expect(text).toContain("Želiš li da ti javljamo o novostima?");
    expect(text).toContain("promocije i najave novih programa");
    expect(text).toContain("Uključi");
    expect(text).toContain("Ne sada");
  });

  it("labels both actions for screen readers", () => {
    stubPreferencesEndpoint();
    const screen = renderWithQueryClient(
      <CampaignsOptInSheet open onOpenChange={() => {}} onSeen={() => {}} />,
      seedPreferences,
    );

    expect(
      screen.getByTestId("campaigns-opt-in-accept").getAttribute("aria-label"),
    ).toBe(i18n.t("client.campaignsOptIn.acceptA11y"));
    expect(
      screen.getByTestId("campaigns-opt-in-decline").getAttribute("aria-label"),
    ).toBe(i18n.t("client.campaignsOptIn.declineA11y"));
  });

  it("writes campaignsEnabled: true into the preferences cache on Uključi", async () => {
    const bodies = stubPreferencesEndpoint();
    const screen = renderWithQueryClient(
      <CampaignsOptInSheet open onOpenChange={() => {}} onSeen={() => {}} />,
      seedPreferences,
    );

    fireEvent.click(screen.getByTestId("campaigns-opt-in-accept"));

    await waitFor(() => {
      const cached = screen.client.getQueryData<{
        preferences: { campaignsEnabled: boolean };
      }>(preferencesKey);
      expect(cached?.preferences.campaignsEnabled).toBe(true);
    });
    await waitFor(() => expect(bodies).toEqual([{ campaignsEnabled: true }]));
  });

  it("closes and marks itself seen on Uključi", async () => {
    stubPreferencesEndpoint();
    const closes: boolean[] = [];
    let seen = 0;
    const screen = renderWithQueryClient(
      <CampaignsOptInSheet
        open
        onOpenChange={(next) => closes.push(next)}
        onSeen={() => {
          seen += 1;
        }}
      />,
      seedPreferences,
    );

    fireEvent.click(screen.getByTestId("campaigns-opt-in-accept"));

    await waitFor(() => expect(closes).toContain(false));
    expect(seen).toBe(1);
  });

  it("closes and marks itself seen on Ne sada without touching the preference", async () => {
    const bodies = stubPreferencesEndpoint();
    const closes: boolean[] = [];
    let seen = 0;
    const screen = renderWithQueryClient(
      <CampaignsOptInSheet
        open
        onOpenChange={(next) => closes.push(next)}
        onSeen={() => {
          seen += 1;
        }}
      />,
      seedPreferences,
    );

    fireEvent.click(screen.getByTestId("campaigns-opt-in-decline"));

    await waitFor(() => expect(closes).toContain(false));
    expect(seen).toBe(1);
    expect(bodies).toEqual([]);
    const cached = screen.client.getQueryData<{
      preferences: { campaignsEnabled: boolean };
    }>(preferencesKey);
    expect(cached?.preferences.campaignsEnabled).toBe(false);
  });

  it("marks itself seen when swiped away with no answer", async () => {
    stubPreferencesEndpoint();
    let seen = 0;
    const screen = renderWithQueryClient(
      <CampaignsOptInSheet
        open
        onOpenChange={() => {}}
        onSeen={() => {
          seen += 1;
        }}
      />,
      seedPreferences,
    );

    // A swipe-down or backdrop tap reaches AppSheet, which calls
    // onOpenChange(false); the parent then re-renders the sheet closed. Only
    // that second step is observable from here, and it must still mark seen.
    screen.rerender(
      <QueryClientProvider client={screen.client}>
        <CampaignsOptInSheet
          open={false}
          onOpenChange={() => {}}
          onSeen={() => {
            seen += 1;
          }}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(seen).toBe(1));
  });

  it("does not mark itself seen while it has never been open", () => {
    stubPreferencesEndpoint();
    let seen = 0;
    renderWithQueryClient(
      <CampaignsOptInSheet
        open={false}
        onOpenChange={() => {}}
        onSeen={() => {
          seen += 1;
        }}
      />,
      seedPreferences,
    );

    expect(seen).toBe(0);
  });

  it("shows the English copy under the en locale", async () => {
    await i18n.changeLanguage("en");
    stubPreferencesEndpoint();
    const screen = renderWithQueryClient(
      <CampaignsOptInSheet open onOpenChange={() => {}} onSeen={() => {}} />,
      seedPreferences,
    );

    const text = screen.getByTestId("campaigns-opt-in-sheet").textContent ?? "";
    expect(text).toContain("Want to hear about what's new?");
    expect(text).toContain("Turn on");
    expect(text).toContain("Not now");
  });
});
