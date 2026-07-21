/**
 * NotificationsBell behavior tests.
 *
 * The bell reads the same notificationsQueries.list() cache as the inbox.
 * A real QueryClient is seeded with that key (staleTime: Infinity keeps
 * the fetcher idle) — no query-layer mocking, and presses are real clicks.
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { notificationsQueries } from "@/lib/queries/notifications-queries-factory";
import type { Notification } from "@/lib/queries/notifications-queries-factory";
import { NotificationsBell } from "@/components/notifications/notifications-bell";

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

function renderBell({
  notifications,
  onPress = () => {},
}: {
  notifications: Notification[];
  onPress?: () => void;
}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(notificationsQueries.list().queryKey, {
    success: true,
    notifications,
    nextCursor: null,
  });
  return render(
    <QueryClientProvider client={client}>
      <NotificationsBell onPress={onPress} />
    </QueryClientProvider>,
  );
}

describe("NotificationsBell", () => {
  it("shows the unread dot when at least one notification is unread", () => {
    const screen = renderBell({
      notifications: [
        makeNotification({ id: "n1", readAt: null }),
        makeNotification({ id: "n2", readAt: new Date().toISOString() }),
      ],
    });
    expect(screen.getByTestId("notifications-bell-unread-dot")).toBeTruthy();
  });

  it("hides the dot when every notification is read", () => {
    const screen = renderBell({
      notifications: [
        makeNotification({ id: "n3", readAt: new Date().toISOString() }),
      ],
    });
    expect(screen.queryByTestId("notifications-bell-unread-dot")).toBeNull();
  });

  it("hides the dot when there are no notifications", () => {
    const screen = renderBell({ notifications: [] });
    expect(screen.queryByTestId("notifications-bell-unread-dot")).toBeNull();
  });

  it("pressing the bell fires onPress", () => {
    const onPress = vi.fn();
    const screen = renderBell({ notifications: [], onPress });

    fireEvent.click(screen.getByTestId("notifications-bell-button"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
