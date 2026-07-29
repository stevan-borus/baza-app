/**
 * Saving the client health-intake screen returns to the profile.
 *
 * Real Chromium + shipped i18n + a real seeded QueryClient, with `expo-router`
 * stubbed at the package boundary so navigation is observable (`routerCalls`).
 * The screen is only reachable via `router.push` from the profile row, so
 * `back()` is what lands the client where they came from.
 *
 * The POST is served by a stubbed `fetch` — the point under test is what the
 * screen does *after* a successful save, not the request itself (that is
 * covered by test/integration/health-intake-record.test.ts).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fireEvent, waitFor } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";
import React from "react";
import "@/lib/i18n";
import { renderWithQueryClient } from "./helpers";
// Imported by path so the real expo-router types don't reject `routerCalls`;
// the vitest alias makes this the same module the screen imports.
import { routerCalls } from "./stubs/expo-router";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import { healthIntakeQueries } from "@/lib/queries/health-intake-queries-factory";
import ClientProfileHealth from "@/app/(client)/profile/health";

function seedClientUser(client: QueryClient) {
  client.setQueryData(authQueries.me().queryKey, {
    success: true,
    user: {
      id: "u1",
      email: "client@e2e.test",
      firstName: "Ana",
      lastName: "Anić",
      fullName: "Ana Anić",
      role: "CLIENT" as const,
      isActive: true,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      clientProfile: { id: "cp1" },
    },
  });
  // No intake recorded yet → the form renders empty and every answer is a change.
  client.setQueryData(healthIntakeQueries.latest().queryKey, null);
}

/** Fills the four required answers so the draft is dirty *and* valid. */
function completeRequiredAnswers(screen: ReturnType<typeof renderWithQueryClient>) {
  fireEvent.click(screen.getByTestId("pilatesExperience-none"));
  fireEvent.click(screen.getByTestId("underMedicalTreatment-no"));
  fireEvent.click(screen.getByTestId("activityLevel-moderate"));
  fireEvent.click(screen.getByTestId("exerciseFrequency-2-3"));
}

describe("client health intake — save navigates back to profile", () => {
  beforeEach(() => {
    routerCalls.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns to the profile after a successful save", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const screen = renderWithQueryClient(<ClientProfileHealth />, seedClientUser);
    completeRequiredAnswers(screen);

    const save = await screen.findByTestId("profile-health-save");
    fireEvent.click(save);

    await waitFor(() => {
      expect(routerCalls.map((c) => c.method)).toContain("back");
    });
  });

  it("stays on the screen and shows the error when the save fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "nope" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const screen = renderWithQueryClient(<ClientProfileHealth />, seedClientUser);
    completeRequiredAnswers(screen);

    const save = await screen.findByTestId("profile-health-save");
    fireEvent.click(save);

    // The failure message is the signal the save was attempted and rejected.
    await screen.findByText("Slanje nije uspelo — pokušajte ponovo.");
    expect(routerCalls.map((c) => c.method)).not.toContain("back");
  });
});
