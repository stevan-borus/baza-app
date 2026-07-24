/**
 * The admin session edit sheet's "intermediate" (Zahtevno) Switch. Real Chromium + shipped
 * i18n + a real seeded QueryClient (rooms/trainers caches) — the same path
 * production renders. Pins that the switch shows the shipped label, seeds its
 * value from the opened session, and reflects a toggle. Editable any time.
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

describe("SessionEditSheet intermediate switch", () => {
  it("renders the intermediate switch with the shipped label", async () => {
    const screen = renderWithQueryClient(
      <Harness session={baseSession} />,
      seedCaches,
    );
    expect(
      await screen.findByTestId("session-edit-intermediate-switch"),
    ).toBeTruthy();
    expect(screen.getByText("Zahtevno")).toBeTruthy();
  });

  it("seeds the switch ON when the session is already intermediate", async () => {
    const screen = renderWithQueryClient(
      <Harness session={{ ...baseSession, isIntermediate: true }} />,
      seedCaches,
    );
    // react-native-web renders Switch as a wrapper div with the testID and a
    // hidden checkbox input reflecting `value`.
    const wrapper = await screen.findByTestId("session-edit-intermediate-switch");
    const input = wrapper.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!;
    expect(input.checked).toBe(true);
  });

  it("seeds the switch OFF for an unmarked session and toggles on tap", async () => {
    const screen = renderWithQueryClient(
      <Harness session={{ ...baseSession, isIntermediate: false }} />,
      seedCaches,
    );
    const wrapper = await screen.findByTestId("session-edit-intermediate-switch");
    const input = wrapper.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!;
    expect(input.checked).toBe(false);
    fireEvent.click(input);
    expect(input.checked).toBe(true);
  });
});
