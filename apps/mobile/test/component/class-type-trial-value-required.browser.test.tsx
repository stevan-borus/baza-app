/**
 * Tipovi treninga — the trial-session value is now a required field.
 *
 * The server rejects a class type created (or PATCHed) without a positive
 * trialSessionValue, so the form must not let an admin fire that request:
 * both submit buttons stay disabled until the box holds a positive integer.
 */
import { describe, it, expect } from "vitest";
import { fireEvent } from "@testing-library/react";
import React from "react";
import "@/lib/i18n";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import { trainingsQueries } from "@/lib/queries/trainings-queries-factory";
import { renderWithQueryClient } from "./helpers";

import AdminSettingsClassTypes from "@/app/(admin)/katalog/tipovi-treninga";

const EXISTING_CLASS_TYPE = {
  id: "ct-legacy",
  name: "Reformer pilates",
  maxClients: 6,
  durationMins: 60,
  // A legacy row from before the field was required — the edit sheet must
  // still refuse to save it until a value is typed in.
  trialSessionValue: null,
};

function renderScreen() {
  return renderWithQueryClient(<AdminSettingsClassTypes />, (client) => {
    client.setQueryData(authQueries.me().queryKey, {
      success: true,
      user: {
        id: "admin-1",
        email: "admin@test.local",
        firstName: "Admin",
        lastName: "Test",
        fullName: "Admin Test",
        role: "ADMIN" as const,
        isActive: true,
        createdAt: new Date(),
        clientProfile: null,
      },
    });
    client.setQueryData(trainingsQueries.classTypes().queryKey, {
      success: true,
      classTypes: [EXISTING_CLASS_TYPE],
    });
  });
}

// RN-Web renders a disabled Pressable as aria-disabled, not the DOM
// `disabled` attribute, so `toBeDisabled()` misreports here.
function isDisabled(element: HTMLElement): boolean {
  return element.getAttribute("aria-disabled") === "true";
}

describe("Tipovi treninga — trialSessionValue is required", () => {
  it("create submit stays disabled until a positive trial value is typed", () => {
    const screen = renderScreen();
    fireEvent.click(screen.getByTestId("admin-new-class-type-button"));

    const submit = screen.getByTestId("class-type-create-submit");
    fireEvent.change(screen.getByTestId("class-type-name-input"), {
      target: { value: "Probni Reformer" },
    });
    // Name filled, trial value still blank — the old gate would have opened.
    expect(isDisabled(submit)).toBe(true);

    fireEvent.change(screen.getByTestId("class-type-trial-value-input"), {
      target: { value: "1200" },
    });
    expect(isDisabled(submit)).toBe(false);
  });

  it("create submit rejects a zero or nonsense trial value", () => {
    const screen = renderScreen();
    fireEvent.click(screen.getByTestId("admin-new-class-type-button"));

    const submit = screen.getByTestId("class-type-create-submit");
    fireEvent.change(screen.getByTestId("class-type-name-input"), {
      target: { value: "Probni Reformer" },
    });

    for (const raw of ["0", "-500", "abc"]) {
      fireEvent.change(screen.getByTestId("class-type-trial-value-input"), {
        target: { value: raw },
      });
      expect(isDisabled(submit)).toBe(true);
    }
  });

  it("edit save stays disabled while a legacy null value is left blank", () => {
    const screen = renderScreen();
    fireEvent.click(screen.getByTestId(`class-type-row-${EXISTING_CLASS_TYPE.id}`));

    const save = screen.getByTestId("class-type-edit-save-button");
    expect(isDisabled(save)).toBe(true);

    fireEvent.change(screen.getByTestId("class-type-edit-trial-value-input"), {
      target: { value: "2500" },
    });
    expect(isDisabled(save)).toBe(false);
  });

  it("edit save re-disables when the trial value is cleared", () => {
    const screen = renderScreen();
    fireEvent.click(screen.getByTestId(`class-type-row-${EXISTING_CLASS_TYPE.id}`));

    const trialInput = screen.getByTestId("class-type-edit-trial-value-input");
    fireEvent.change(trialInput, { target: { value: "2500" } });
    expect(isDisabled(screen.getByTestId("class-type-edit-save-button"))).toBe(false);

    // Clearing the box can never mean "back to unvalued" — it means the form
    // is incomplete, so the save must close again.
    fireEvent.change(trialInput, { target: { value: "" } });
    expect(isDisabled(screen.getByTestId("class-type-edit-save-button"))).toBe(true);
  });
});
