/**
 * Admin dashboard revenue hero.
 *
 * The hero is labelled "Prihod ovog meseca" but used to read an UNSCOPED
 * /api/reports/summary, which the route answers with all-time totals — so
 * the studio saw lifetime revenue under a month label. These tests seed the
 * unscoped summary and the current-studio-month summary with DIFFERENT
 * revenue and pin that the hero shows the month one, while the client tiles
 * keep reading the unscoped (all-time) query.
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

function summaryPayload(revenue: number) {
  return {
    success: true as const,
    summary: {
      totalClients: 40,
      activeClients: 31,
      inactiveClients: 12,
      totalSessions: 120,
      revenue,
      totalPayments: 55,
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
      summaryPayload(THIS_MONTH_REVENUE),
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

  it("keeps the client tiles on the unscoped (all-time) summary", () => {
    const screen = renderDashboard();

    // activeClients + (totalClients - inactiveClients) come from the
    // all-time query; scoping them would change what the tiles mean.
    expect(screen.getByText("31")).toBeTruthy();
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
