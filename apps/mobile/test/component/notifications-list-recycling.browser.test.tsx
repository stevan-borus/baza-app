/**
 * Mixed header/row rendering for the notifications inbox.
 *
 * The inbox feeds its list a heterogeneous array: short `{kind:"header"}`
 * group labels interleaved with taller `{kind:"row"}` GlassCards. It used to
 * run on LegendList, whose per-type size estimates had to be configured by
 * hand or cells painted blank mid-scroll — the "blank cards until I reload"
 * the studio reported. The inbox now uses RN's FlatList, which measures cells
 * rather than estimating them, so the sizing configuration is gone.
 *
 * What still has to hold, and what these tests pin: every header and every
 * row of a mixed-height list paints, and the keys stay stable per item.
 */
import { describe, it, expect } from "vitest";
import React from "react";
import "@/lib/i18n";
import { notificationsQueries } from "@/lib/queries/notifications-queries-factory";
import type { Notification } from "@/lib/queries/notifications-queries-factory";
import { NotificationsInbox } from "@/components/notifications/notifications-inbox";
import { renderWithQueryClient } from "./helpers";

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "n1",
    type: "GENERAL",
    title: "Test Title",
    body: "Test body",
    payload: null,
    readAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function renderInbox(notifications: Notification[]) {
  return renderWithQueryClient(
    <NotificationsInbox context="client" />,
    (client) => {
      client.setQueryData(notificationsQueries.listInfinite().queryKey, {
        pages: [{ success: true, notifications, nextCursor: null }],
        pageParams: [null],
      });
    },
  );
}

describe("NotificationsInbox — mixed header/row list", () => {
  it("renders every header and every row of a multi-group list", async () => {
    const today = new Date();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const older = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

    const screen = renderInbox([
      makeNotification({ id: "t1", title: "Danas jedan", createdAt: today.toISOString() }),
      makeNotification({ id: "t2", title: "Danas dva", createdAt: today.toISOString() }),
      makeNotification({ id: "y1", title: "Juče jedan", createdAt: yesterday.toISOString() }),
      makeNotification({ id: "o1", title: "Ranije jedan", createdAt: older.toISOString() }),
    ]);

    // All three group headers.
    expect(await screen.findByText("Danas")).toBeTruthy();
    expect(screen.getByText("Juče")).toBeTruthy();
    expect(screen.getByText("Ranije")).toBeTruthy();

    // Every row painted — none blank.
    for (const title of ["Danas jedan", "Danas dva", "Juče jedan", "Ranije jedan"]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
  });

  it("renders rows with mixed body lengths in one list without dropping any", async () => {
    // Variable row heights are what a flat estimate cannot represent.
    const screen = renderInbox([
      makeNotification({ id: "s1", title: "Kratak", body: "Kratko." }),
      makeNotification({
        id: "l1",
        title: "Dugačak",
        body: "Ovo je znatno duži tekst obaveštenja koji se prelama u više redova i time menja visinu kartice u listi.",
      }),
      makeNotification({ id: "s2", title: "Opet kratak", body: "Opet kratko." }),
      makeNotification({ id: "e1", title: "Bez teksta", body: "" }),
    ]);

    await screen.findByText("Kratak");
    for (const title of ["Kratak", "Dugačak", "Opet kratak", "Bez teksta"]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
  });
});

describe("NotificationsInbox — list keys", () => {
  it("keys every header and row distinctly, so no cell is reused for another", async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const screen = renderInbox([
      makeNotification({ id: "k1", title: "Prva" }),
      makeNotification({ id: "k2", title: "Druga" }),
      makeNotification({ id: "k3", title: "Treća", createdAt: yesterday.toISOString() }),
    ]);

    await screen.findByText("Danas");
    const rowIds = ["k1", "k2", "k3"].map(
      (id) => screen.getByTestId(`notification-row-${id}-unread`),
    );
    expect(new Set(rowIds).size).toBe(3);
    // Both group headers survive alongside the rows.
    expect(screen.getByText("Juče")).toBeTruthy();
  });
});
