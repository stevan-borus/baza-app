/**
 * The "Rezervacije" selection footer — the bar holding "Poništi" and
 * "Rezerviši"/"Otkaži" — must be fixed studio chrome pinned to the bottom,
 * never the last row of the scroller.
 *
 * Half of the reported symptom is structural and IS observable here: the bar
 * must render as a sibling of the scroll host, outside its scrolled content,
 * so it stays put while cards move under it.
 *
 * The other half — the see-through background — is not observable in this
 * layer. Uniwind's className→style rewriting lives in Metro's resolver, and
 * react-native-web drops `className` entirely on the way to the DOM (every
 * View lands as an atomic `css-view-*` class). A computed background-color
 * assertion would read `rgba(0, 0, 0, 0)` for a correct bar and a broken one
 * alike. That half is pinned down in
 * test/unit/reservation-toolbar-background.test.ts, which checks the class the
 * component actually ships against the tokens the theme actually defines.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import dayjs from "dayjs";
import "@/lib/i18n";
import { renderWithQueryClient } from "./helpers";

const TODAY = dayjs("2026-05-27T09:00:00");

const apiRequestMock = vi.fn(async (path: string) => {
  if (path === "/api/sessions/availability") {
    return { success: true, sessions: [] };
  }
  if (path === "/api/auth/me") {
    return { user: { id: "admin-1", email: "a@b.c", role: "ADMIN", isActive: true } };
  }
  if (path.startsWith("/api/bookings")) {
    return { success: true, bookings: [], nextCursor: null };
  }
  return { success: true };
});
vi.mock("@/lib/api-request", () => ({
  apiRequest: (path: string) => apiRequestMock(path),
}));

vi.mock("./stubs/expo-router", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useLocalSearchParams: () => ({
      clientProfileId: "client-1",
      clientUserId: "user-1",
      clientFullName: "Ana Anić",
    }),
  };
});

import { ReservationMode } from "@/components/admin/reservation-mode";

beforeEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  apiRequestMock.mockClear();
  process.env.TEST_ANCHOR_TIME = TODAY.toISOString();
});

/**
 * The scroll host RNW renders for the screen's main `<ScrollView>`.
 *
 * RNW emits overflow through an atomic `css-view-*` class rather than an
 * inline style, so this has to go through getComputedStyle.
 */
function findScroller(container: HTMLElement): HTMLElement {
  const hosts = Array.from(
    container.querySelectorAll<HTMLElement>("div"),
  ).filter((el) => {
    const { overflowY } = window.getComputedStyle(el);
    return overflowY === "auto" || overflowY === "scroll";
  });
  if (hosts.length === 0) throw new Error("no scroll host rendered");
  // The outermost one is the screen's own list; inner ones are chip rails.
  return hosts.reduce((a, b) => (a.contains(b) ? a : b));
}

describe("Rezervacije selection toolbar", () => {
  it("renders outside the scroller so it cannot scroll away with the cards", async () => {
    const screen = renderWithQueryClient(<ReservationMode />);
    const cta = await screen.findByTestId("reservation-toolbar-cta");
    const scroller = findScroller(screen.container as HTMLElement);

    expect(
      scroller.contains(cta),
      "the pinned footer must not live inside the scrolled content",
    ).toBe(false);
  });

  it("is a direct child of the screen body, so `absolute bottom-0` pins to the screen", async () => {
    // `absolute` resolves against the nearest positioned/relative ancestor.
    // The bar has to hang off ScreenContainerRaw's flex-1 body — the same box
    // the scroller fills — or it would pin to something that itself moves.
    const screen = renderWithQueryClient(<ReservationMode />);
    const cta = await screen.findByTestId("reservation-toolbar-cta");
    const scroller = findScroller(screen.container as HTMLElement);

    // Walk up from the CTA to the child-of-body level and confirm it is the
    // scroller's sibling.
    const body = scroller.parentElement!;
    let node: HTMLElement | null = cta;
    while (node && node.parentElement !== body) node = node.parentElement;

    expect(node, "footer must hang off the same body box as the scroller").not.toBeNull();
    expect(node!.parentElement).toBe(body);
  });
});
