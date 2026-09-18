/**
 * Admin dashboard revenue hero and client tiles.
 *
 * The hero is labelled "Prihod ovog meseca" but used to read an UNSCOPED
 * /api/reports/summary, which the route answers with all-time totals — so
 * the studio saw lifetime revenue under a month label. The three client tiles
 * had the same shape of bug: they read the all-time query, where
 * `activeClients` is really `isActive` (the soft-delete flag) and the
 * "attendance rate" was clients divided by clients. Both now read the
 * month-scoped summary, so these tests seed the two windows with DIFFERENT
 * numbers and pin that nothing on the screen shows the all-time ones.
 */
import { describe, it, expect } from "vitest";
import React from "react";
import "@/lib/i18n";
import { reportsQueries } from "@/lib/queries/reports-queries-factory";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import { currentStudioMonthWindow } from "@/lib/admin/studio-month-window";
import { monthKeyFromDate } from "@/lib/use-week-navigation";
import { now } from "@/lib/now";
import dayjs from "dayjs";
import { renderWithQueryClient } from "./helpers";
import AdminPregled from "@/app/(admin)/pregled/index";

const ALL_TIME_REVENUE = 987_000;
const THIS_MONTH_REVENUE = 123_000;
const MONTH_ACTIVE_PACKAGES = 17;
const MONTH_NEW_CLIENTS = 3;
const MONTH_ATTENDANCE_RATE = 82;

function summaryPayload(
  revenue: number,
  tiles?: {
    clientsWithActivePackage?: number;
    newClients?: number;
    attendanceRate?: number | null;
  },
) {
  return {
    success: true as const,
    summary: {
      totalClients: 40,
      activeClients: 31,
      inactiveClients: 12,
      totalSessions: 120,
      revenue,
      totalPayments: 55,
      clientsWithActivePackage: tiles?.clientsWithActivePackage ?? 0,
      newClients: tiles?.newClients ?? 0,
      attendanceRate:
        tiles?.attendanceRate === undefined ? null : tiles.attendanceRate,
    },
  };
}

function renderDashboard() {
  return renderWithQueryClient(<AdminPregled />, (client) => {
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
    // All-time totals — what the unscoped query returns today.
    client.setQueryData(
      reportsQueries.summary().queryKey,
      summaryPayload(ALL_TIME_REVENUE),
    );
    // The current studio month, computed with the same helper the screen uses.
    client.setQueryData(
      reportsQueries.summary(currentStudioMonthWindow()).queryKey,
      summaryPayload(THIS_MONTH_REVENUE, {
        clientsWithActivePackage: MONTH_ACTIVE_PACKAGES,
        newClients: MONTH_NEW_CLIENTS,
        attendanceRate: MONTH_ATTENDANCE_RATE,
      }),
    );
    const monthKey = monthKeyFromDate(dayjs(now()));
    client.setQueryData(
      sessionsQueries.availabilityByMonth(monthKey).queryKey,
      { success: true, month: monthKey, sessions: [] },
    );
  });
}

describe("Admin dashboard — revenue hero", () => {
  it("shows the current studio month's revenue under the month label", () => {
    const screen = renderDashboard();

    expect(screen.getByText("Prihod ovog meseca")).toBeTruthy();

    const hero = screen.getByTestId("pregled-revenue-hero");
    expect(hero.textContent).toContain(
      THIS_MONTH_REVENUE.toLocaleString("sr-RS"),
    );
    expect(hero.textContent).not.toContain(
      ALL_TIME_REVENUE.toLocaleString("sr-RS"),
    );
  });

  it("reads the client tiles from the month-scoped summary", () => {
    const screen = renderDashboard();

    // This used to read the unscoped query's `activeClients` (31) — the
    // soft-delete count, i.e. the whole directory under an "active" label.
    expect(
      screen.getByTestId("pregled-stat-active-clients").textContent,
    ).toBe(String(MONTH_ACTIVE_PACKAGES));
    expect(screen.queryByText("31")).toBeNull();
  });
});

describe("currentStudioMonthWindow", () => {
  it("spans the current Belgrade calendar month from the 05:00 studio boundary", () => {
    const { from, to } = currentStudioMonthWindow();
    const fromDate = new Date(from);
    const toDate = new Date(to);

    expect(fromDate.getTime()).toBeLessThanOrEqual(now().getTime());
    expect(toDate.getTime()).toBeGreaterThan(now().getTime());
    // Belgrade 05:00 on the 1st, rendered back in Belgrade wall clock.
    const belgradeFrom = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Belgrade",
      day: "numeric",
      hour: "numeric",
      hour12: false,
    }).format(fromDate);
    expect(belgradeFrom).toBe("1, 05");
  });
});

describe("Admin dashboard — client tiles", () => {
  it("counts clients with a usable package, not the whole directory", () => {
    const screen = renderDashboard();

    expect(screen.getByText("Aktivni klijenti")).toBeTruthy();
    expect(
      screen.getByTestId("pregled-stat-active-clients").textContent,
    ).toBe(String(MONTH_ACTIVE_PACKAGES));
    // 31 is the all-time payload's `activeClients` — the soft-delete count
    // the tile used to show.
    expect(screen.queryByText("31")).toBeNull();
  });

  it("shows the month's new clients", () => {
    const screen = renderDashboard();

    expect(screen.getByTestId("pregled-stat-new-clients").textContent).toBe(
      String(MONTH_NEW_CLIENTS),
    );
  });

  it("shows the kept-reservation rate as a percentage", () => {
    const screen = renderDashboard();

    expect(
      screen.getByTestId("pregled-stat-attendance-rate").textContent,
    ).toBe(`${MONTH_ATTENDANCE_RATE}%`);
  });
});
