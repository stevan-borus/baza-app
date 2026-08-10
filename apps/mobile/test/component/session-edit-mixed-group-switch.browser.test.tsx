/**
 * The admin session edit sheet's "Mešana grupa" Switch. Real Chromium + shipped
 * i18n + a real seeded QueryClient (rooms/trainers caches) — the same path
 * production renders. Pins that the switch shows the shipped label, seeds its
 * value from the opened session, reflects a toggle, and stays independent of
 * the intermediate switch sitting right above it.
 */
import { describe, it, expect } from "vitest";
import { fireEvent } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";
import React from "react";
import "@/lib/i18n";
import { renderWithQueryClient } from "./helpers";
import { roomsQueries } from "@/lib/queries/rooms-queries-factory";
import { usersQueries } from "@/lib/queries/users-queries-factory";
import {
  SessionEditSheet,
  useSessionEditSheet,
  type EditSessionInput,
} from "@/components/ui/session-edit-sheet";

function seedCaches(client: QueryClient) {
  client.setQueryData(roomsQueries.list().queryKey, {
    success: true,
    rooms: [{ id: "r1", name: "Sala 1", capacity: 6 }],
  });
  client.setQueryData(usersQueries.trainers().queryKey, {
    success: true,
    users: [{ id: "t1", fullName: "Trainer T", role: "TRAINER" as const }],
  });
}

const baseSession: EditSessionInput = {
  id: "s1",
  classTypeName: "Reformer pilates",
  roomId: "r1",
  roomName: "Sala 1",
  trainerUserId: "t1",
  bookedCount: 0,
  capacity: 6,
  startsAt: new Date("2026-06-10T10:00:00Z"),
  endsAt: new Date("2026-06-10T11:00:00Z"),
  recurringScheduleId: null,
  isActive: true,
};

/** Mounts the sheet already opened for `session` (open on first render). */
function Harness({ session }: { session: EditSessionInput }) {
  const sheet = useSessionEditSheet();
  const opened = React.useRef(false);
  if (!opened.current) {
    opened.current = true;
    sheet.openForSession(session);
  }
  return <SessionEditSheet {...sheet.bind()} />;
}

/** react-native-web renders Switch as a wrapper div holding a hidden checkbox. */
function checkboxIn(wrapper: HTMLElement) {
  return wrapper.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
}

describe("SessionEditSheet mixed-group switch", () => {
  it("renders the mixed-group switch with the shipped label", async () => {
    const screen = renderWithQueryClient(
      <Harness session={baseSession} />,
      seedCaches,
    );
    expect(
      await screen.findByTestId("session-edit-mixed-group-switch"),
    ).toBeTruthy();
    expect(screen.getByText("Mešana grupa")).toBeTruthy();
  });

  it("seeds the switch ON when the session is already a mixed group", async () => {
    const screen = renderWithQueryClient(
      <Harness session={{ ...baseSession, isMixedGroup: true }} />,
      seedCaches,
    );
    const wrapper = await screen.findByTestId("session-edit-mixed-group-switch");
    expect(checkboxIn(wrapper).checked).toBe(true);
  });

  it("seeds the switch OFF for an unmarked session and toggles on tap", async () => {
    const screen = renderWithQueryClient(
      <Harness session={{ ...baseSession, isMixedGroup: false }} />,
      seedCaches,
    );
    const wrapper = await screen.findByTestId("session-edit-mixed-group-switch");
    const input = checkboxIn(wrapper);
    expect(input.checked).toBe(false);
    fireEvent.click(input);
    expect(input.checked).toBe(true);
  });

  it("toggles independently of the intermediate switch", async () => {
    // The two marks are orthogonal — flipping mixed-group must not disturb
    // an already-set intermediate mark, and vice versa.
    const screen = renderWithQueryClient(
      <Harness session={{ ...baseSession, isIntermediate: true }} />,
      seedCaches,
    );
    const mixed = checkboxIn(
      await screen.findByTestId("session-edit-mixed-group-switch"),
    );
    const intermediate = checkboxIn(
      screen.getByTestId("session-edit-intermediate-switch"),
    );

    expect(intermediate.checked).toBe(true);
    expect(mixed.checked).toBe(false);

    fireEvent.click(mixed);
    expect(mixed.checked).toBe(true);
    expect(intermediate.checked).toBe(true);
  });
});
