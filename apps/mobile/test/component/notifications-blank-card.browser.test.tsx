/**
 * Blank-notification-card regression tests.
 *
 * The studio reported notifications rendering as "just blank cards" until the
 * app was reloaded. Two independent causes produced that:
 *
 *  1. Recycling: a heterogeneous list (short group headers interleaved with
 *     tall GlassCard rows) driven by a single flat `estimatedItemSize` mis-sizes
 *     containers during scroll, so recycled cells can paint empty. Covered by
 *     the per-item-type sizing assertions in the sibling
 *     `notifications-list-recycling` suite.
 *
 *  2. Empty bodies: `notification.general.body` is "" in both locales and
 *     GENERAL is the default type, while CAMPAIGN bodies are admin free text
 *     that can arrive whitespace-only. The row then rendered a title plus a
 *     blank line, and the detail sheet — which filters empty paragraphs —
 *     rendered literally nothing.
 *
 * These tests pin the contract: a notification with no usable body renders a
 * deliberate title-only card, never an empty rectangle.
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

/** The rendered body Text of a row, or null when the row renders no body. */
function bodyTextOf(container: HTMLElement, id: string): string | null {
  const el = container.querySelector(`[data-testid="notification-body-${id}"]`);
  return el ? el.textContent : null;
}

describe("NotificationsInbox — notifications with no usable body", () => {
  it("renders no body element for a GENERAL notification whose body is empty", async () => {
    // GENERAL is the DEFAULT notification type and `notification.general.body`
    // is "" in both locales, so this is the most common way a blank card is
    // produced in production.
    const screen = renderInbox([
      makeNotification({ id: "g1", title: "Obaveštenje", body: "" }),
    ]);

    await screen.findByTestId("notification-row-g1-unread");
    // The card still carries its title — it is a title-only card, not empty.
    expect(screen.getByText("Obaveštenje")).toBeTruthy();
    // No blank body line is rendered at all.
    expect(bodyTextOf(screen.container, "g1")).toBeNull();
  });

  it("renders no body element for a CAMPAIGN whose body is whitespace-only", async () => {
    // Campaign bodies are admin free text and bypass the i18n message keys
    // entirely, so an accidental "   \n\n  " reaches the row verbatim.
    const screen = renderInbox([
      makeNotification({
        id: "c1",
        type: "CAMPAIGN",
        title: "Nova promocija",
        body: "   \n\n  \t ",
      }),
    ]);

    await screen.findByTestId("notification-row-c1-unread");
    expect(screen.getByText("Nova promocija")).toBeTruthy();
    expect(bodyTextOf(screen.container, "c1")).toBeNull();
  });

  it("still renders the body when it has real text", async () => {
    const screen = renderInbox([
      makeNotification({ id: "ok1", title: "Ima teksta", body: "Pravi sadržaj." }),
    ]);

    await screen.findByTestId("notification-row-ok1-unread");
    expect(bodyTextOf(screen.container, "ok1")).toBe("Pravi sadržaj.");
  });

  it("falls back to the stored body when the resolved messageKey body is empty", async () => {
    // `notification.general.body` resolves to "" — an empty translation must
    // not win over a non-empty server-stored body.
    const screen = renderInbox([
      makeNotification({
        id: "g2",
        title: "server title",
        body: "Server je poslao pravi tekst.",
        payload: { messageKey: "notification.general" },
      }),
    ]);

    await screen.findByTestId("notification-row-g2-unread");
    expect(bodyTextOf(screen.container, "g2")).toBe(
      "Server je poslao pravi tekst.",
    );
  });

  it("keeps a title-only card visually intentional rather than an empty rectangle", async () => {
    // A card with neither body nor avatar must still render its title and
    // timestamp, so it reads as a deliberate short notice.
    const screen = renderInbox([
      makeNotification({ id: "g3", title: "Kratko obaveštenje", body: "" }),
    ]);

    const row = await screen.findByTestId("notification-row-g3-unread");
    expect(row.textContent).toContain("Kratko obaveštenje");
    // Non-trivial content: title + relative timestamp, never a blank card.
    expect((row.textContent ?? "").trim().length).toBeGreaterThan(
      "Kratko obaveštenje".length,
    );
  });
});
