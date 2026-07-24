/**
 * Assign-package sheet — birthday-gift class-type picker (Vitest Browser Mode,
 * real Chromium, real RNW, real i18n with the shipped Serbian copy).
 *
 * Feature 3: one 🎂 SKU serves every class type. When the SELECTED package type
 * is a birthday gift, the sheet shows a single-select class-type picker
 * prefilled from `initialClassTypeId`; submit carries `classTypeIdsOverride`.
 * A non-gift SKU shows no picker and submits no override. The server-side
 * validation (400s, snapshot) is covered by the integration suite.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, waitFor, within } from "@testing-library/react";
import React from "react";
import "@/lib/i18n";
import { renderWithQueryClient } from "./helpers";
import { packagesQueries } from "@/lib/queries/packages-queries-factory";
import { trainingsQueries } from "@/lib/queries/trainings-queries-factory";

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

const GIFT = {
  id: "pt-gift",
  name: "Rođendanski poklon",
  sessionCount: 1,
  validityDays: 30,
  lateCancelHours: 12,
  price: null,
  classTypes: [{ id: "ct-mat", name: "Mat" }],
  isBirthdayGift: true,
};
const NON_GIFT = {
  id: "pt-reformer",
  name: "Reformer 8",
  sessionCount: 8,
  validityDays: 60,
  lateCancelHours: 12,
  price: 24000,
  classTypes: [{ id: "ct-reformer", name: "Reformer" }],
  isBirthdayGift: false,
};

const CLASS_TYPES = [
  { id: "ct-mat", name: "Mat", maxClients: 10, durationMins: 60 },
  { id: "ct-reformer", name: "Reformer", maxClients: 6, durationMins: 60 },
  { id: "ct-barre", name: "Barre", maxClients: 8, durationMins: 60 },
];

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
        packageTypes: [GIFT, NON_GIFT],
      });
      client.setQueryData(trainingsQueries.classTypes().queryKey, {
        success: true,
        classTypes: CLASS_TYPES,
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

// The mocked apiRequest is shared with any query the sheet fires; the mutation
// is the one POST to the client-packages endpoint.
function postCall() {
  return apiRequestMock.mock.calls.find(
    (c) => c[0] === "/api/packages/client-packages" && (c[1] as { method?: string })?.method === "POST",
  );
}

beforeEach(() => {
  apiRequestMock.mockClear();
});

describe("AssignPackageSheetContent gift class-type picker", () => {
  it("shows the picker prefilled from initialClassTypeId once the gift SKU is selected", () => {
    const screen = renderSheet("ct-reformer");
    // Pick the gift SKU.
    fireEvent.click(screen.getByTestId("assign-package-option-pt-gift"));
    // Picker renders with its shipped Serbian label.
    expect(screen.getByText("Tip treninga za poklon")).toBeTruthy();
    // The prefilled row carries the selection check; the others don't.
    const prefilled = screen.getByTestId("assign-gift-class-type-ct-reformer");
    expect(within(prefilled).queryByTestId("lucide-Check")).toBeTruthy();
    const other = screen.getByTestId("assign-gift-class-type-ct-barre");
    expect(within(other).queryByTestId("lucide-Check")).toBeNull();
  });

  it("submits classTypeIdsOverride reflecting the chosen (changed) class type", async () => {
    const screen = renderSheet("ct-reformer");
    fireEvent.click(screen.getByTestId("assign-package-option-pt-gift"));
    // Admin changes the pick from the prefilled Reformer to Barre.
    fireEvent.click(screen.getByTestId("assign-gift-class-type-ct-barre"));

    fireEvent.click(screen.getByTestId("assign-package-submit"));
    await waitFor(() => expect(postCall()).toBeTruthy());
    expect(postCall()![1]).toMatchObject({
      method: "POST",
      body: { packageTypeId: "pt-gift", classTypeIdsOverride: ["ct-barre"] },
    });
  });

  it("a non-gift SKU shows no picker and submits no override", async () => {
    const screen = renderSheet("ct-reformer");
    fireEvent.click(screen.getByTestId("assign-package-option-pt-reformer"));
    expect(screen.queryByText("Tip treninga za poklon")).toBeNull();

    fireEvent.click(screen.getByTestId("assign-package-submit"));
    await waitFor(() => expect(postCall()).toBeTruthy());
    const body = postCall()![1] as { body: Record<string, unknown> };
    expect(body.body).not.toHaveProperty("classTypeIdsOverride");
    expect(body.body).toMatchObject({ packageTypeId: "pt-reformer" });
  });
});
