/**
 * InviteTrainerSheet — Vitest Browser Mode (real Chromium, real RNW, real i18n
 * with the shipped Serbian copy, a real QueryClient).
 *
 * The point under test is the REDUCED field set: a trainer invite collects
 * email + first/last name + optional phone and deliberately has no date of
 * birth (DOB only feeds clientProfile at redemption, and a trainer has none).
 * The POST is served by a stubbed `fetch` so the request body itself is
 * assertable — the server-side role handling is covered by the integration
 * suite.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import "@/lib/i18n";
import { renderWithQueryClient } from "./helpers";
import { InviteTrainerSheet } from "@/components/admin/trainer-flows/invite-trainer-sheet";

/** Stubs `fetch` with the shape createInviteMutationOptions parses, and
 *  records every request body it was handed. */
function stubInviteEndpoint() {
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(
        JSON.stringify({
          success: true,
          invite: {
            id: "inv-1",
            email: "trener@baza.test",
            firstName: "Mila",
            lastName: "Milić",
            fullName: "Mila Milić",
            phone: null,
            role: "TRAINER",
            status: "PENDING",
            createdAt: "2026-08-12T10:00:00.000Z",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }),
  );
  return bodies;
}

function renderSheet(onOpenChange: (open: boolean) => void = () => {}) {
  return renderWithQueryClient(
    <InviteTrainerSheet open onOpenChange={onOpenChange} />,
  );
}

/** RN-Web renders a disabled Pressable as aria-disabled, not the `disabled`
 *  attribute — `toBeDisabled()` misreports it. */
function isDisabled(el: HTMLElement) {
  return el.getAttribute("aria-disabled") === "true";
}

function fillRequiredFields(screen: ReturnType<typeof renderSheet>) {
  fireEvent.change(screen.getByTestId("invite-trainer-email-input"), {
    target: { value: "trener@baza.test" },
  });
  fireEvent.change(screen.getByTestId("invite-trainer-name-input"), {
    target: { value: "Mila" },
  });
  fireEvent.change(screen.getByTestId("invite-trainer-lastname-input"), {
    target: { value: "Milić" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("InviteTrainerSheet", () => {
  it("collects the reduced trainer field set — no date of birth", async () => {
    const screen = renderSheet();

    expect(await screen.findByText("Pozovi trenera")).toBeTruthy();
    expect(screen.getByTestId("invite-trainer-email-input")).toBeTruthy();
    expect(screen.getByTestId("invite-trainer-name-input")).toBeTruthy();
    expect(screen.getByTestId("invite-trainer-lastname-input")).toBeTruthy();
    expect(screen.getByTestId("invite-trainer-phone-input")).toBeTruthy();

    // A trainer has no clientProfile, so the DOB control the client sheet
    // renders must not exist here — by testID or by its shipped placeholder.
    expect(screen.queryByTestId("invite-create-dob-input")).toBeNull();
    expect(screen.queryByTestId("invite-trainer-dob-input")).toBeNull();
    expect(screen.queryByText("Datum rođenja")).toBeNull();
  });

  it("requires email + first + last name before enabling submit", async () => {
    const screen = renderSheet();

    const submit = await screen.findByTestId("invite-trainer-submit-button");
    expect(isDisabled(submit)).toBe(true);

    fireEvent.change(screen.getByTestId("invite-trainer-email-input"), {
      target: { value: "trener@baza.test" },
    });
    expect(isDisabled(submit)).toBe(true);

    fireEvent.change(screen.getByTestId("invite-trainer-name-input"), {
      target: { value: "Mila" },
    });
    expect(isDisabled(submit)).toBe(true);

    fireEvent.change(screen.getByTestId("invite-trainer-lastname-input"), {
      target: { value: "Milić" },
    });
    // Phone is deliberately left empty — it is optional.
    expect(isDisabled(submit)).toBe(false);
  });

  it("submits role TRAINER without dateOfBirth", async () => {
    const bodies = stubInviteEndpoint();
    const onOpenChange = vi.fn();
    const screen = renderSheet(onOpenChange);

    fillRequiredFields(screen);
    fireEvent.click(await screen.findByTestId("invite-trainer-submit-button"));

    await waitFor(() => expect(bodies).toHaveLength(1));
    const body = bodies[0];
    expect(body).toMatchObject({
      email: "trener@baza.test",
      firstName: "Mila",
      lastName: "Milić",
      role: "TRAINER",
    });
    expect(body.dateOfBirth).toBeUndefined();

    // Success closes the sheet and clears the form.
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(
      (screen.getByTestId("invite-trainer-email-input") as HTMLInputElement)
        .value,
    ).toBe("");
  });
});
