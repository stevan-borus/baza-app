/**
 * Heterogeneous-list sizing tests for the notifications inbox.
 *
 * The inbox feeds LegendList a mixed list: short `{kind:"header"}` group
 * labels (~30pt) interleaved with tall `{kind:"row"}` GlassCards (~90pt+).
 * A single flat `estimatedItemSize` makes the virtualizer size every
 * container by one average, which is the classic cause of cells painting
 * blank while recycling during scroll — exactly the "blank cards until I
 * reload" the studio reported.
 *
 * LegendList v3.1.1 solves this with `getItemType`: it keys its running
 * average-size map (and its view pool) per item type, so headers and rows
 * are estimated independently. These tests pin that the inbox declares a
 * type per item and that a mixed list renders every item.
 */
import { describe, it, expect } from "vitest";
import React from "react";
import "@/lib/i18n";
import { notificationsQueries } from "@/lib/queries/notifications-queries-factory";
import type { Notification } from "@/lib/queries/notifications-queries-factory";
import {
  NotificationsInbox,
  notificationItemType,
} from "@/components/notifications/notifications-inbox";
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

describe("notificationItemType — LegendList item-type key", () => {
  it("gives group headers and notification rows DIFFERENT types", () => {
    // Distinct types are the whole point: LegendList keeps one average size
    // (and one recycling pool) per type. Same type = one blended average =
    // mis-sized containers = blank cells.
    const header = notificationItemType({
      kind: "header",
      groupKey: "today",
      labelKey: "notifications.groupToday",
    });
    const row = notificationItemType({
      kind: "row",
      notification: makeNotification(),
    });

    expect(header).not.toBe(row);
  });

  it("returns a stable type for the same kind of item", () => {
    // An unstable type would defeat pooling entirely.
    const a = notificationItemType({
      kind: "row",
      notification: makeNotification({ id: "a", body: "short" }),
    });
    const b = notificationItemType({
      kind: "row",
      notification: makeNotification({ id: "b", body: "a much longer body" }),
    });

    expect(a).toBe(b);
    expect(typeof a).toBe("string");
  });
});

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
