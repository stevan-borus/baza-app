/**
 * NotificationsInbox behavior tests.
 *
 * Seeds the real listInfinite cache and renders against real i18n, so the
 * payload-interpolation path (messageKey → sr translation with whitelisted
 * payload fields) is exercised with the SHIPPED strings — the old static
 * suite re-implemented t() and would have kept passing if sr.json broke.
 * The detail-sheet-on-tap path depends on native text-measurement
 * (onTextLayout truncation probe) and stays with e2e.
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

function renderInbox(
  notifications: Notification[],
  props: Partial<React.ComponentProps<typeof NotificationsInbox>> = {},
) {
  return renderWithQueryClient(
    <NotificationsInbox context="client" {...props} />,
    (client) => {
      client.setQueryData(notificationsQueries.listInfinite().queryKey, {
        pages: [{ success: true, notifications, nextCursor: null }],
        pageParams: [null],
      });
    },
  );
}

describe("NotificationsInbox — empty state", () => {
  it("renders the client empty copy", async () => {
    const screen = renderInbox([]);
    expect(
      await screen.findByText("Nemate novih obaveštenja."),
    ).toBeTruthy();
  });

  it("renders the admin empty copy", async () => {
    const screen = renderInbox([], { context: "admin" });
    expect(await screen.findByText("Nema novih obaveštenja")).toBeTruthy();
  });
});

describe("NotificationsInbox — rows and grouping", () => {
  it("renders a row per notification under a Danas header", async () => {
    const screen = renderInbox([
      makeNotification({ id: "n1", title: "Prva" }),
      makeNotification({ id: "n2", title: "Druga", readAt: new Date().toISOString() }),
    ]);

    expect(await screen.findByText("Danas")).toBeTruthy();
    expect(screen.getByText("Prva")).toBeTruthy();
    expect(screen.getByText("Druga")).toBeTruthy();
    // Read state is part of the row's testID contract.
    expect(screen.getByTestId("notification-row-n1-unread")).toBeTruthy();
    expect(screen.getByTestId("notification-row-n2-read")).toBeTruthy();
  });

  it("buckets older notifications under Juče", async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const screen = renderInbox([
      makeNotification({ id: "n3", createdAt: yesterday.toISOString() }),
    ]);

    expect(await screen.findByText("Juče")).toBeTruthy();
    expect(screen.queryByText("Danas")).toBeNull();
  });
});

describe("NotificationsInbox — leading treatment", () => {
  it("shows an initials avatar when the payload names a person", async () => {
    const screen = renderInbox([
      makeNotification({
        id: "n4",
        payload: { clientFullName: "Marko Marković" },
      }),
    ]);

    const avatar = await screen.findByTestId("notification-avatar-n4");
    expect(avatar.textContent).toBe("MM");
  });

  it("shows no avatar without a person in the payload", async () => {
    const screen = renderInbox([makeNotification({ id: "n5" })]);

    await screen.findByTestId("notification-row-n5-unread");
    expect(screen.queryByTestId("notification-avatar-n5")).toBeNull();
  });

  it("marks CAMPAIGN notifications with the megaphone badge", async () => {
    const screen = renderInbox([
      makeNotification({ id: "n6", type: "CAMPAIGN" }),
    ]);

    const badge = await screen.findByTestId("notification-campaign-badge-n6");
    expect(badge.querySelector('[data-testid="lucide-Megaphone"]')).toBeTruthy();
    expect(screen.queryByTestId("notification-avatar-n6")).toBeNull();
  });

  it("gives non-campaign notifications no megaphone badge", async () => {
    const screen = renderInbox([makeNotification({ id: "n7" })]);

    await screen.findByTestId("notification-row-n7-unread");
    expect(screen.queryByTestId("notification-campaign-badge-n7")).toBeNull();
  });
});

describe("NotificationsInbox — payload interpolation", () => {
  it("renders the sr translation with payload values for a known messageKey", async () => {
    const screen = renderInbox([
      makeNotification({
        id: "n8",
        title: "server title",
        body: "server body",
        payload: { messageKey: "notif.consentRefused", userName: "Ana Anić" },
      }),
    ]);

    // Real sr.json: "{{userName}} je odbio/la pravne dokumente i odjavljen/a je."
    // The body appears twice by design: the clamped row Text plus the hidden
    // no-clamp truncation probe.
    expect(
      (
        await screen.findAllByText(
          "Ana Anić je odbio/la pravne dokumente i odjavljen/a je.",
        )
      ).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText("Korisnik nije prihvatio dokumente"),
    ).toBeTruthy();
  });

  it("falls back to the stored title/body when the messageKey has no entry", async () => {
    const screen = renderInbox([
      makeNotification({
        id: "n9",
        title: "Stored Title",
        body: "Stored body",
        payload: { messageKey: "notif.does_not_exist" },
      }),
    ]);

    expect(await screen.findByText("Stored Title")).toBeTruthy();
    expect(screen.getAllByText("Stored body").length).toBeGreaterThanOrEqual(1);
    // The raw key never leaks into the UI.
    expect(screen.queryByText(/notif\.does_not_exist/)).toBeNull();
  });
});

describe("NotificationsInbox — loading and error", () => {
  it("renders the skeleton while the first page loads", () => {
    // No seeded cache: the query starts fetching → isLoading on first paint.
    const screen = renderWithQueryClient(<NotificationsInbox context="client" />);
    expect(screen.container.querySelectorAll("*").length).toBeGreaterThan(0);
    expect(
      screen.container.querySelector('[data-testid^="notification-row-"]'),
    ).toBeNull();
  });

  it("renders the client error copy when the fetch fails", async () => {
    // Unseeded → the real queryFn hits this test server's /api/notifications,
    // which doesn't exist → apiRequest throws → isError.
    const screen = renderWithQueryClient(<NotificationsInbox context="client" />);
    expect(
      await screen.findByText("Nije moguće učitati obaveštenja.", undefined, {
        timeout: 5000,
      }),
    ).toBeTruthy();
  });

  it("renders the admin error copy when the fetch fails", async () => {
    const screen = renderWithQueryClient(<NotificationsInbox context="admin" />);
    expect(
      await screen.findByText("Greška pri učitavanju obaveštenja", undefined, {
        timeout: 5000,
      }),
    ).toBeTruthy();
  });
});
