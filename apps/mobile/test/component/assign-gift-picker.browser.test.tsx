/**
 * Assign-package sheet — gifting (Vitest Browser Mode, real Chromium, real
 * RNW, real i18n with the shipped Serbian copy).
 *
 * A gift is now a REAL, priced package handed over without payment rather than
 * its own unpriced 🎂 SKU: it keeps the package price so trainer payout can
 * value the sessions, and grants ONE session by default instead of the whole
 * pack. This pins that contract — the toggle, the default, the cap, and the
 * fact that the retired gift SKUs are no longer selectable at all.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import "@/lib/i18n";
import { renderWithQueryClient } from "./helpers";
import { packagesQueries } from "@/lib/queries/packages-queries-factory";

const apiRequestMock = vi.fn(
  async (_path: string, _opts?: Record<string, unknown>) => ({
    success: true,
    clientPackage: { id: "cpkg-1" },
  }),
);
vi.mock("@/lib/api-request", () => ({
  apiRequest: (path: string, opts?: Record<string, unknown>) =>
    apiRequestMock(path, opts),
}));

import { AssignPackageSheetContent } from "@/components/admin/assign-package-sheet-content";

const CLIENT = {
  id: "profile-1",
  user: { id: "user-1", fullName: "Ana Ković", email: "ana@test.local" },
};

/** A retired gift SKU — must not appear in the picker any more. */
const LEGACY_GIFT = {
  id: "pt-gift",
  name: "Rođendanski poklon",
  sessionCount: 1,
  validityDays: 30,
  lateCancelHours: 12,
  price: null,
  classTypes: [{ id: "ct-mat", name: "Mat" }],
  isBirthdayGift: true,
};
const REFORMER_12 = {
  id: "pt-reformer",
  name: "Reformer 12",
  sessionCount: 12,
  validityDays: 60,
  lateCancelHours: 12,
  price: 15000,
  classTypes: [{ id: "ct-reformer", name: "Reformer" }],
  isBirthdayGift: false,
};

function renderSheet(initialClassTypeId?: string) {
  return renderWithQueryClient(
    <AssignPackageSheetContent
      client={CLIENT}
      mode="comp"
      initialClassTypeId={initialClassTypeId}
      onSuccess={() => {}}
    />,
    (client) => {
      client.setQueryData(packagesQueries.types().queryKey, {
        success: true,
        packageTypes: [LEGACY_GIFT, REFORMER_12],
      });
      // Seed the client's existing-packages cache so the duplicate-hint query
      // doesn't hit the mocked apiRequest — keeps mock.calls to the POST only.
      client.setQueryData(packagesQueries.clientPackages(CLIENT.id).queryKey, {
        success: true,
        packages: [],
      });
    },
  );
}

function postCall() {
  return apiRequestMock.mock.calls.find(
    (c) =>
      c[0] === "/api/packages/client-packages" &&
      (c[1] as { method?: string })?.method === "POST",
  );
}

beforeEach(() => {
  apiRequestMock.mockClear();
});

describe("AssignPackageSheetContent gifting", () => {
  it("no longer offers the retired gift SKUs", () => {
    const screen = renderSheet();
    // Selecting an unpriced gift SKU would create a package worth nothing to
    // the trainer, so it is filtered out entirely.
    expect(screen.queryByTestId("assign-package-option-pt-gift")).toBeNull();
    expect(screen.queryByTestId("assign-package-option-pt-reformer")).toBeTruthy();
  });

  it("gifts one session by default, keeping the real package", async () => {
    const screen = renderSheet();
    fireEvent.click(screen.getByTestId("assign-package-option-pt-reformer"));
    fireEvent.click(screen.getByTestId("assign-gift-toggle"));

    fireEvent.click(screen.getByTestId("assign-package-submit"));
    await waitFor(() => expect(postCall()).toBeTruthy());

    const body = postCall()![1] as {
      body: {
        packageTypeId: string;
        isGift: boolean;
        sessionsGranted: number;
      };
    };
    // The REAL package, so payroll can value the session at 15000/12.
    expect(body.body.packageTypeId).toBe("pt-reformer");
    expect(body.body.isGift).toBe(true);
    // Gifting "Reformer 12" must not hand over all twelve.
    expect(body.body.sessionsGranted).toBe(1);
  });

  it("sends no gift fields when the toggle is off", async () => {
    const screen = renderSheet();
    fireEvent.click(screen.getByTestId("assign-package-option-pt-reformer"));

    fireEvent.click(screen.getByTestId("assign-package-submit"));
    await waitFor(() => expect(postCall()).toBeTruthy());

    const body = postCall()![1] as { body: Record<string, unknown> };
    expect(body.body.isGift).toBeUndefined();
    expect(body.body.sessionsGranted).toBeUndefined();
  });

  it("carries an edited gift session count", async () => {
    const screen = renderSheet();
    fireEvent.click(screen.getByTestId("assign-package-option-pt-reformer"));
    fireEvent.click(screen.getByTestId("assign-gift-toggle"));
    fireEvent.change(screen.getByTestId("assign-gift-sessions"), {
      target: { value: "3" },
    });

    fireEvent.click(screen.getByTestId("assign-package-submit"));
    await waitFor(() => expect(postCall()).toBeTruthy());

    const body = postCall()![1] as { body: { sessionsGranted: number } };
    expect(body.body.sessionsGranted).toBe(3);
  });

  it("blocks submit when the gift count exceeds the package's own sessions", () => {
    const screen = renderSheet();
    fireEvent.click(screen.getByTestId("assign-package-option-pt-reformer"));
    fireEvent.click(screen.getByTestId("assign-gift-toggle"));
    // Reformer 12 holds twelve; thirteen would invent a session.
    fireEvent.change(screen.getByTestId("assign-gift-sessions"), {
      target: { value: "13" },
    });

    fireEvent.click(screen.getByTestId("assign-package-submit"));
    expect(postCall()).toBeFalsy();
  });

  it("opens with the gift toggle on for a birthday deep link", async () => {
    // A BIRTHDAY_ADMIN_PROMPT tap is by definition a gift.
    const screen = renderSheet("ct-reformer");
    fireEvent.click(screen.getByTestId("assign-package-option-pt-reformer"));

    fireEvent.click(screen.getByTestId("assign-package-submit"));
    await waitFor(() => expect(postCall()).toBeTruthy());

    const body = postCall()![1] as { body: { isGift: boolean } };
    expect(body.body.isGift).toBe(true);
  });
});
