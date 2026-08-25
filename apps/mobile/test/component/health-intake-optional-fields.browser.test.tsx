/**
 * Only the medical-treatment question is required on the health intake.
 *
 * A tester found that activity level and exercise frequency latched on first
 * tap with no way back, and that Save sat disabled with no explanation. Both
 * are single-select, so "deselect" means tapping the active option again.
 *
 * Real Chromium + shipped i18n + a real seeded QueryClient, mounting the
 * client health screen the same way profile-health-save-navigates-back does.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { fireEvent } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";
import React from "react";
import "@/lib/i18n";
import { renderWithQueryClient } from "./helpers";
import { routerCalls } from "./stubs/expo-router";
import {
  EMPTY_INTAKE,
  type HealthIntakeState,
  intakeToInput,
  isIntakeValid,
} from "@/components/consent/health-intake-form";
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

/** react-native-web drops `accessibilityState`, so the controls set aria-checked directly. */
function isChecked(el: HTMLElement): boolean {
  return el.getAttribute("aria-checked") === "true";
}

describe("health intake — optional lifestyle fields", () => {
  beforeEach(() => {
    routerCalls.length = 0;
  });

  it("deselects an activity level when the already-selected one is tapped again", () => {
    const screen = renderWithQueryClient(<ClientProfileHealth />, seedClientUser);

    fireEvent.click(screen.getByTestId("activityLevel-moderate"));
    expect(isChecked(screen.getByTestId("activityLevel-moderate"))).toBe(true);

    fireEvent.click(screen.getByTestId("activityLevel-moderate"));
    expect(isChecked(screen.getByTestId("activityLevel-moderate"))).toBe(false);
  });

  it("replaces the activity level when a different option is tapped", () => {
    const screen = renderWithQueryClient(<ClientProfileHealth />, seedClientUser);

    fireEvent.click(screen.getByTestId("activityLevel-moderate"));
    fireEvent.click(screen.getByTestId("activityLevel-high"));

    expect(isChecked(screen.getByTestId("activityLevel-moderate"))).toBe(false);
    expect(isChecked(screen.getByTestId("activityLevel-high"))).toBe(true);
  });

  it("deselects an exercise frequency when the already-selected one is tapped again", () => {
    const screen = renderWithQueryClient(<ClientProfileHealth />, seedClientUser);

    fireEvent.click(screen.getByTestId("exerciseFrequency-2-3"));
    expect(isChecked(screen.getByTestId("exerciseFrequency-2-3"))).toBe(true);

    fireEvent.click(screen.getByTestId("exerciseFrequency-2-3"));
    expect(isChecked(screen.getByTestId("exerciseFrequency-2-3"))).toBe(false);
  });

  it("enables Save with only the medical-treatment question answered", async () => {
    const screen = renderWithQueryClient(<ClientProfileHealth />, seedClientUser);

    fireEvent.click(screen.getByTestId("underMedicalTreatment-no"));

    const save = await screen.findByTestId("profile-health-save");
    expect(save.getAttribute("aria-disabled")).not.toBe("true");
  });

  it("keeps Save disabled while the medical-treatment question is unanswered", async () => {
    const screen = renderWithQueryClient(<ClientProfileHealth />, seedClientUser);

    // Answer everything *except* the one required question.
    fireEvent.click(screen.getByTestId("pilatesExperience-none"));
    fireEvent.click(screen.getByTestId("activityLevel-moderate"));
    fireEvent.click(screen.getByTestId("exerciseFrequency-2-3"));

    const save = await screen.findByTestId("profile-health-save");
    expect(save.getAttribute("aria-disabled")).toBe("true");
  });

  it("marks the medical-treatment question as the required one and says why Save is off", () => {
    const screen = renderWithQueryClient(<ClientProfileHealth />, seedClientUser);

    expect(screen.getByText("Obavezno")).toBeTruthy();
    expect(
      screen.getByText("Odgovorite na obavezno pitanje da biste sačuvali."),
    ).toBeTruthy();
  });

  it("hides the required hint once the medical-treatment question is answered", () => {
    const screen = renderWithQueryClient(<ClientProfileHealth />, seedClientUser);

    fireEvent.click(screen.getByTestId("underMedicalTreatment-no"));

    expect(
      screen.queryByText("Odgovorite na obavezno pitanje da biste sačuvali."),
    ).toBeNull();
  });
});

/**
 * `isIntakeValid` and `intakeToInput` are pure, but they live beside the
 * component and so pull in react-native — which the Node-environment unit
 * project can't load. They run here instead, in the same browser project.
 */
function intakeState(patch: Partial<HealthIntakeState> = {}): HealthIntakeState {
  return { ...EMPTY_INTAKE, ...patch };
}

describe("isIntakeValid", () => {
  it("rejects an intake with the medical-treatment question unanswered", () => {
    expect(isIntakeValid(intakeState({ consented: true }))).toBe(false);
  });

  it("accepts a 'no' to medical treatment with every optional field empty", () => {
    expect(
      isIntakeValid(
        intakeState({ consented: true, underMedicalTreatment: false }),
      ),
    ).toBe(true);
  });

  it("still requires details when the client is under medical treatment", () => {
    expect(
      isIntakeValid(
        intakeState({ consented: true, underMedicalTreatment: true }),
      ),
    ).toBe(false);
    expect(
      isIntakeValid(
        intakeState({
          consented: true,
          underMedicalTreatment: true,
          medicalTreatmentDetails: "Fizikalna terapija",
        }),
      ),
    ).toBe(true);
  });

  it("no longer requires pilates experience, activity level or frequency", () => {
    expect(
      isIntakeValid(
        intakeState({
          consented: true,
          underMedicalTreatment: false,
          pilatesExperience: [],
          activityLevel: null,
          exerciseFrequency: null,
        }),
      ),
    ).toBe(true);
  });

  it("still enforces consent when the caller asks for it", () => {
    const withoutConsent = intakeState({ underMedicalTreatment: false });
    expect(isIntakeValid(withoutConsent)).toBe(false);
    expect(isIntakeValid(withoutConsent, false)).toBe(true);
  });
});

describe("intakeToInput", () => {
  it("omits the single-select lifestyle fields when nothing is picked", () => {
    const input = intakeToInput(intakeState({ underMedicalTreatment: false }));
    expect(input.activityLevel).toBeUndefined();
    expect(input.exerciseFrequency).toBeUndefined();
    expect(input.pilatesExperience).toEqual([]);
  });

  it("passes the picked lifestyle codes through", () => {
    const input = intakeToInput(
      intakeState({
        underMedicalTreatment: false,
        activityLevel: "moderate",
        exerciseFrequency: "2-3",
      }),
    );
    expect(input.activityLevel).toBe("moderate");
    expect(input.exerciseFrequency).toBe("2-3");
  });
});
