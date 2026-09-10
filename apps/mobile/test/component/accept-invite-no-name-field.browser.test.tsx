/**
 * The invite-activation form collects credentials only.
 *
 * The server creates the account from the invite row's firstName/lastName and
 * its body schema accepts nothing but `token` and `password`, so a name field
 * on this screen was collecting a value that was thrown away. Real invite
 * links carry only `?token=`, so it never even prefilled.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import "@/lib/i18n";
import { renderWithQueryClient } from "./helpers";

// Mutated per test, read by the expo-router stub below. A token is what
// separates the form from the "invalid invite" state; real links carry
// nothing else.
const TOKEN = "t".repeat(32);
let searchParams: Record<string, string> = {};

vi.mock("./stubs/expo-router", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useLocalSearchParams: () => searchParams,
  };
});

import AcceptInviteScreen from "@/app/accept-invite";

describe("accept-invite form", () => {
  beforeEach(() => {
    searchParams = { token: TOKEN };
  });

  it("renders no name field", () => {
    const screen = renderWithQueryClient(<AcceptInviteScreen />);

    expect(screen.queryByTestId("invite-name-input")).toBeNull();
    expect(screen.queryByText("Vaše ime")).toBeNull();
  });

  it("still asks for a password, a confirmation and a submit", () => {
    const screen = renderWithQueryClient(<AcceptInviteScreen />);

    expect(screen.getByTestId("invite-password-input")).toBeTruthy();
    expect(screen.getByTestId("invite-confirm-password-input")).toBeTruthy();
    expect(screen.getByTestId("invite-submit-button")).toBeTruthy();
  });

  it("ignores email and invitedBy params entirely", () => {
    searchParams = {
      token: TOKEN,
      email: "pozvana.osoba@baza.test",
      invitedBy: "Milica Trener",
    };

    const screen = renderWithQueryClient(<AcceptInviteScreen />);

    // No inviter badge: neither the interpolated copy nor the bare name.
    expect(screen.queryByText("Pozivnica od Milica Trener")).toBeNull();
    expect(screen.queryByText(/Milica Trener/)).toBeNull();

    // No read-only email row: nothing on screen holds the passed address.
    expect(screen.queryByDisplayValue("pozvana.osoba@baza.test")).toBeNull();
    expect(screen.queryByText("pozvana.osoba@baza.test")).toBeNull();
  });
});
