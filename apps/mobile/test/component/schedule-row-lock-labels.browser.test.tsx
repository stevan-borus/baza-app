/**
 * ScheduleRow lock-label tests — Vitest Browser Mode (real Chromium, real
 * react-native-web rendering, real i18n with the shipped Serbian copy).
 *
 * The row's right-hand action slot is the only place a locked session states
 * WHY before the sheet opens, so each lockReason has to name its own state.
 * EMPTY_CUTOFF especially: it isn't a package problem, and the RENEW fallback
 * would tell the client to renew a package that is perfectly fine.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import "@/lib/i18n";
import {
  ScheduleRow,
  type ScheduleRowSession,
} from "@/components/ui/schedule-row";

const noop = () => {};

function lockedSession(
  lockReason: ScheduleRowSession["lockReason"],
): ScheduleRowSession {
  return {
    id: "s1",
    classTypeName: "Reformer pilates",
    startsAt: new Date("2026-06-10T10:00:00Z"),
    endsAt: new Date("2026-06-10T11:00:00Z"),
    roomName: "Sala 1",
    availableSlots: 3,
    capacity: 6,
    bookable: false,
    lockReason,
  };
}

describe("ScheduleRow lock labels", () => {
  it("EMPTY_CUTOFF shows a closed label, never the renew copy", () => {
    const screen = render(
      <ScheduleRow session={lockedSession("EMPTY_CUTOFF")} onPress={noop} />,
    );

    expect(screen.getByText("Zatvoreno")).toBeTruthy();
    expect(screen.queryByText("Obnovite")).toBeNull();
  });

  it("RENEW still falls back to the renew label", () => {
    const screen = render(
      <ScheduleRow session={lockedSession("RENEW")} onPress={noop} />,
    );

    expect(screen.getByText("Obnovite")).toBeTruthy();
  });

  it("FULLY_HELD keeps its own label", () => {
    const screen = render(
      <ScheduleRow session={lockedSession("FULLY_HELD")} onPress={noop} />,
    );

    expect(screen.getByText("Bez termina")).toBeTruthy();
  });
});
