/**
 * Katalog → Treneri, the sign-in-lock half — real Chromium, real RNW, the
 * shipped Serbian copy, a real seeded QueryClient.
 *
 * Two things this screen is now the only place to do, and both are why the
 * roster switched off `usersQueries.trainers()` (trainers only, no lock
 * field) and onto the admin staff endpoint:
 *
 * 1. See that a trainer is locked out and lift it. A locked trainer cannot
 *    sign in even with the right password, and they will phone the studio,
 *    not wait 15 minutes.
 * 2. Do the same for an ADMIN. Admins were on no screen at all — the roster
 *    filtered them out — so an admin who locked themselves out had no one to
 *    ask but another admin, on a screen that did not list them.
 *
 * The subtle one is the nested press: the trainer row IS a Pressable that
 * navigates to the rates screen, and RN has no stopPropagation. Pressing
 * Otključaj must unlock WITHOUT also navigating, or the admin lands on a
 * different screen every time they clear a lock.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import "@/lib/i18n";
import { renderWithQueryClient } from "./helpers";
import { routerCalls } from "./stubs/expo-router";
import { formatTime } from "@/lib/format-date";
import type { AdminUser } from "@baza/types/admin-users";

/** "Now" for this spec. Both the lock instants below are relative to it. */
const TODAY = "2026-08-19T09:00:00.000Z";
const MINUTE = 60_000;

const LOCKED_UNTIL = new Date(Date.parse(TODAY) + 10 * MINUTE).toISOString();

const LOCKED_TRAINER: AdminUser = {
  id: "trainer-locked",
  firstName: "Mila",
  lastName: "Milić",
  fullName: "Mila Milić",
  email: "mila@baza.test",
  role: "TRAINER",
  lockedUntil: LOCKED_UNTIL,
};

const OPEN_TRAINER: AdminUser = {
  id: "trainer-open",
  firstName: "Ana",
  lastName: "Nikolić",
  fullName: "Ana Nikolić",
  email: "ana@baza.test",
  role: "TRAINER",
  lockedUntil: null,
};

const LOCKED_ADMIN: AdminUser = {
  id: "admin-locked",
  firstName: "Jovan",
  lastName: "Jovanović",
  fullName: "Jovan Jovanović",
  email: "jovan@baza.test",
  role: "ADMIN",
  lockedUntil: LOCKED_UNTIL,
};

const OPEN_ADMIN: AdminUser = {
  id: "admin-open",
  firstName: "Petar",
  lastName: "Petrović",
  fullName: "Petar Petrović",
  email: "petar@baza.test",
  role: "ADMIN",
  lockedUntil: null,
};

let staff: AdminUser[] = [];
const posts: { path: string; body: unknown }[] = [];
let unlockFails = false;

const apiRequestMock = vi.fn(
  async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (opts?.method === "POST") {
      posts.push({ path, body: opts.body });
      if (unlockFails) throw new Error("network down");
      return { success: true, user: { id: "x", lockedUntil: null } };
    }
    if (path === "/api/admin/users") return { success: true, users: staff };
    if (path === "/api/payroll/rates") return { success: true, rates: [] };
    if (path === "/api/trainings/class-types")
      return { success: true, classTypes: [] };
    if (path === "/api/invites") return { success: true, invites: [] };
    return { success: true };
  },
);
vi.mock("@/lib/api-request", () => ({
  apiRequest: (path: string, opts?: Record<string, unknown>) =>
    apiRequestMock(path, opts),
}));

import TrainerRoster from "@/app/(admin)/katalog/treneri/index";

beforeEach(() => {
  process.env.TEST_ANCHOR_TIME = TODAY;
  staff = [LOCKED_TRAINER, OPEN_TRAINER, LOCKED_ADMIN, OPEN_ADMIN];
  posts.length = 0;
  unlockFails = false;
  routerCalls.length = 0;
  apiRequestMock.mockClear();
});

describe("Treneri roster — sign-in locks", () => {
  it("marks the locked trainer with the deadline and offers the unlock", async () => {
    const screen = renderWithQueryClient(<TrainerRoster />);

    const badge = await screen.findByTestId(
      `tim-locked-badge-${LOCKED_TRAINER.id}`,
    );
    expect(badge.textContent).toContain("Zaključan do");
    expect(badge.textContent).toContain(formatTime(LOCKED_UNTIL, "sr"));
    expect(
      screen.getByTestId(`tim-unlock-button-${LOCKED_TRAINER.id}`).textContent,
    ).toContain("Otključaj");
  });

  it("leaves an unlocked trainer with neither badge nor button", async () => {
    const screen = renderWithQueryClient(<TrainerRoster />);

    // Wait for the row itself first — otherwise this passes on empty render.
    await screen.findByTestId(`procenti-trainer-${OPEN_TRAINER.id}`);
    expect(
      screen.queryByTestId(`tim-locked-badge-${OPEN_TRAINER.id}`),
    ).toBeNull();
    expect(
      screen.queryByTestId(`tim-unlock-button-${OPEN_TRAINER.id}`),
    ).toBeNull();
  });

  it("lists admins in their own section with name and email", async () => {
    const screen = renderWithQueryClient(<TrainerRoster />);

    // The heading interpolates a count, so its text spans several nodes —
    // match the section element, not one exact string.
    const heading = await screen.findByTestId("tim-admins-section-label");
    expect(heading.textContent).toContain("Admini");
    expect(heading.textContent).toContain("2");

    const row = await screen.findByTestId(`tim-admin-row-${OPEN_ADMIN.id}`);
    expect(row.textContent).toContain("Petar Petrović");
    expect(row.textContent).toContain("petar@baza.test");
  });

  it("keeps admins out of the trainer rate rows", async () => {
    const screen = renderWithQueryClient(<TrainerRoster />);

    await screen.findByTestId(`procenti-trainer-${OPEN_TRAINER.id}`);
    // An admin has no commission — a rate row for one is a bug the API
    // rejects anyway.
    expect(
      screen.queryByTestId(`procenti-trainer-${OPEN_ADMIN.id}`),
    ).toBeNull();
  });

  it("offers the unlock on a locked admin too", async () => {
    const screen = renderWithQueryClient(<TrainerRoster />);

    expect(
      await screen.findByTestId(`tim-locked-badge-${LOCKED_ADMIN.id}`),
    ).toBeTruthy();
    expect(
      screen.getByTestId(`tim-unlock-button-${LOCKED_ADMIN.id}`),
    ).toBeTruthy();
  });

  it("pressing unlock posts to that user's unlock endpoint", async () => {
    const screen = renderWithQueryClient(<TrainerRoster />);

    fireEvent.click(
      await screen.findByTestId(`tim-unlock-button-${LOCKED_TRAINER.id}`),
    );

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].path).toBe(
      `/api/admin/users/${LOCKED_TRAINER.id}/unlock`,
    );
  });

  it("unlocking a trainer does NOT also navigate to their rates screen", async () => {
    const screen = renderWithQueryClient(<TrainerRoster />);

    fireEvent.click(
      await screen.findByTestId(`tim-unlock-button-${LOCKED_TRAINER.id}`),
    );

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(routerCalls).toHaveLength(0);
  });

  it("tapping the trainer row itself still opens the rates screen", async () => {
    const screen = renderWithQueryClient(<TrainerRoster />);

    fireEvent.click(
      await screen.findByTestId(`procenti-trainer-${LOCKED_TRAINER.id}`),
    );

    expect(routerCalls).toHaveLength(1);
    expect(routerCalls[0].method).toBe("push");
  });

  it("a failed unlock says so instead of failing silently", async () => {
    unlockFails = true;
    const screen = renderWithQueryClient(<TrainerRoster />);

    fireEvent.click(
      await screen.findByTestId(`tim-unlock-button-${LOCKED_TRAINER.id}`),
    );

    await waitFor(() =>
      expect(screen.getByText("Otključavanje nije uspelo.")).toBeTruthy(),
    );
  });
});
