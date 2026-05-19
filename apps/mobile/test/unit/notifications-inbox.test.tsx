/**
 * NotificationsInbox unit tests.
 *
 * Verifies that the shared inbox component renders:
 *  - an empty-state when there are no notifications
 *  - a row per notification when notifications are present
 *  - a localized group header for each day bucket
 *
 * Uses renderToStaticMarkup + mocked react-native (the repo-standard approach).
 * @testing-library/react-native is not installed in this project.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Notification } from "@/lib/queries/notifications-queries-factory";

// ─── react-native mock ─────────────────────────────────────────────────────
vi.mock("react-native", () => {
  const RR = require("react");
  return {
    View: ({ children, style, className, testID, ...p }: any) =>
      RR.createElement(
        "div",
        {
          ...p,
          "data-testid": testID,
          "data-class": className,
          style:
            typeof style === "object" && !Array.isArray(style) ? style : undefined,
        },
        children,
      ),
    Text: ({ children, style, className, testID, numberOfLines: _n, ...p }: any) =>
      RR.createElement(
        "span",
        {
          ...p,
          "data-testid": testID,
          "data-class": className,
          style: typeof style === "object" ? style : undefined,
        },
        children,
      ),
    Pressable: ({ children, onPress: _o, testID, className, ...p }: any) =>
      RR.createElement(
        "button",
        { ...p, "data-testid": testID, "data-class": className },
        children,
      ),
    ActivityIndicator: ({ testID, style, ...p }: any) =>
      require("react").createElement("span", {
        ...p,
        "data-testid": testID ?? "activity-indicator",
        "data-role": "activity-indicator",
        style: typeof style === "object" ? style : undefined,
      }),
    Platform: { OS: "web" },
  };
});

// ─── expo vector icons mock ───────────────────────────────────────────────
vi.mock("@expo/vector-icons/FontAwesome", () => ({
  default: ({ name }: any) =>
    require("react").createElement("i", { "data-icon": name }),
}));

// ─── LegendList mock ──────────────────────────────────────────────────────
vi.mock("@legendapp/list", () => {
  const RR = require("react");
  return {
    LegendList: (props: any) => {
      const data: any[] = props.data ?? [];
      const renderedItems = data.map((item: any, index: number) => {
        const key = props.keyExtractor
          ? props.keyExtractor(item, index)
          : String(index);
        const node = props.renderItem({ item, index });
        return RR.createElement("div", { key, "data-row-key": key }, node);
      });
      const footer = props.ListFooterComponent
        ? typeof props.ListFooterComponent === "function"
          ? RR.createElement(props.ListFooterComponent)
          : props.ListFooterComponent
        : null;
      return RR.createElement(
        "div",
        { "data-role": "legend-list" },
        renderedItems,
        footer,
      );
    },
  };
});

// ─── MotiView mock ────────────────────────────────────────────────────────
vi.mock("@/components/ui/styled", () => ({
  MotiView: ({ children, style }: any) =>
    require("react").createElement(
      "div",
      { "data-role": "moti-view", style },
      children,
    ),
}));

// ─── GlassCard mock ───────────────────────────────────────────────────────
vi.mock("@/components/ui/glass-card", () => ({
  GlassCard: ({ children }: any) =>
    require("react").createElement(
      "div",
      { "data-testid": "glass-card" },
      children,
    ),
}));

// ─── Tokens mock ──────────────────────────────────────────────────────────
vi.mock("@/components/ui/tokens", () => ({
  useThemeTokens: () => ({
    accent: "#2e5b42",
    foreground: "#0F0F0D",
    muted: "rgba(15,15,13,0.62)",
    faint: "rgba(15,15,13,0.38)",
    background: "#F4EFE3",
    glass: "rgba(0,0,0,0.04)",
    glassStrong: "rgba(0,0,0,0.08)",
    glassAndroid: "rgba(255,255,255,0.95)",
    glassBorder: "rgba(0,0,0,0.10)",
  }),
}));

// ─── States mock ──────────────────────────────────────────────────────────
vi.mock("@/components/ui/states", () => ({
  EmptyState: ({ title }: any) =>
    require("react").createElement(
      "div",
      { "data-testid": "empty-state" },
      require("react").createElement("span", {}, title),
    ),
  ErrorState: ({ message }: any) =>
    require("react").createElement(
      "div",
      { "data-testid": "error-state" },
      require("react").createElement("span", {}, message),
    ),
}));

// ─── Skeleton mock ────────────────────────────────────────────────────────
vi.mock("@/components/ui/skeleton", () => ({
  SkeletonList: ({ count }: any) =>
    require("react").createElement("div", {
      "data-testid": "skeleton-list",
      "data-count": count,
    }),
}));

// ─── Typography mock ──────────────────────────────────────────────────────
vi.mock("@/components/ui/typography", () => ({
  SectionLabel: ({ children }: any) =>
    require("react").createElement(
      "span",
      { "data-role": "section-label" },
      children,
    ),
}));

// ─── i18n mock ────────────────────────────────────────────────────────────
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: "en" },
  }),
}));

// ─── expo-router mock ─────────────────────────────────────────────────────
// The component uses `useFocusEffect` to auto-mark-on-mount. Importing it
// pulls in JSX-laden `Stack.tsx` from node_modules which vitest can't
// transform. Stub it to a no-op for tests.
vi.mock("expo-router", () => ({
  useFocusEffect: (_cb: () => unknown) => {
    // No-op for static-render tests; behavior is exercised in integration.
  },
  router: { push: () => {} },
}));

// ─── notification-tap mock ────────────────────────────────────────────────
// The component now imports `useNotificationTapHandler` which transitively
// pulls in expo-modules-core via react-query/expo-router. Stub it to a no-op
// for these static-render tests — tap-routing has its own unit tests.
vi.mock("@/lib/notification-tap", () => ({
  useNotificationTapHandler: () => () => false,
}));

// ─── Anchor-time helper ───────────────────────────────────────────────────
import { now } from "@/lib/now";

// ─── dayjs setup ─────────────────────────────────────────────────────────
// The relativeTime plugin is extended at app startup (lib/i18n.ts) but not
// in the test env. Extend it here so `d.fromNow()` is available when
// notifications are rendered.
import dayjsLib from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
dayjsLib.extend(relativeTime);

// ─── Notifications queries mock ───────────────────────────────────────────
const mockNotifications: Notification[] = [];

vi.mock("@/lib/queries/notifications-queries-factory", () => ({
  notificationsQueries: {
    listInfinite: () => ({
      queryKey: ["notifications", "list-infinite"],
      queryFn: async () => ({
        success: true,
        notifications: mockNotifications,
        nextCursor: null,
      }),
      initialPageParam: null,
      getNextPageParam: () => undefined,
    }),
    markAsRead: () => ({
      mutationKey: ["notifications", "mark-read"],
      mutationFn: async (_id: string) => ({ success: true }),
    }),
    markManyRead: () => ({
      mutationKey: ["notifications", "mark-read-batch"],
      mutationFn: async (_ids: string[]) => ({ success: true, count: 0 }),
    }),
  },
}));

// ─── react-query mock ─────────────────────────────────────────────────────
// We mock @tanstack/react-query to return controlled state so the component
// renders synchronously in renderToStaticMarkup without needing an async
// QueryClient.
let queryState = {
  isLoading: false,
  isError: false,
  data: undefined as any,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: () => {},
};

vi.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: (_options: any) => queryState,
  useMutation: (options: any) => ({
    mutate: options.mutationFn,
    isPending: false,
  }),
  useQueryClient: () => ({
    invalidateQueries: () => {},
  }),
}));

// ─── Target component ─────────────────────────────────────────────────────
import { NotificationsInbox } from "@/components/notifications/notifications-inbox";

function renderInbox(props: Partial<React.ComponentProps<typeof NotificationsInbox>> = {}) {
  const defaults: React.ComponentProps<typeof NotificationsInbox> = { context: "client" };
  return renderToStaticMarkup(
    React.createElement(NotificationsInbox, { ...defaults, ...props }),
  );
}

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "n1",
    type: "GENERAL",
    title: "Test Title",
    body: "Test body",
    payload: null,
    readAt: null,
    createdAt: now().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  // Reset to empty/loaded state before each test
  queryState = {
    isLoading: false,
    isError: false,
    data: { pages: [{ notifications: [], nextCursor: null }] },
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: () => {},
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("NotificationsInbox — empty state", () => {
  it("renders empty state for client context when no notifications", () => {
    const html = renderInbox({ context: "client" });
    expect(html).toContain("client.notifications.empty");
  });

  it("renders empty state for admin context when no notifications", () => {
    const html = renderInbox({ context: "admin" });
    expect(html).toContain("admin.notifications.empty");
  });

  it("renders empty-state wrapper element", () => {
    const html = renderInbox({ context: "client" });
    expect(html).toContain('data-testid="empty-state"');
  });
});

describe("NotificationsInbox — notifications list", () => {
  beforeEach(() => {
    const nowIso = now().toISOString();
    queryState.data = {
      pages: [
        {
          notifications: [
            makeNotification({ id: "n1", title: "Booking Confirmed", createdAt: nowIso }),
            makeNotification({ id: "n2", title: "Reminder", type: "SESSION_REMINDER", createdAt: nowIso }),
          ],
          nextCursor: null,
        },
      ],
    };
  });

  it("renders a row for each notification", () => {
    const html = renderInbox({ context: "client" });
    expect(html).toContain('data-testid="notification-row-n1-unread"');
    expect(html).toContain('data-testid="notification-row-n2-unread"');
  });

  it("renders notification title text", () => {
    const html = renderInbox({ context: "client" });
    expect(html).toContain("Booking Confirmed");
    expect(html).toContain("Reminder");
  });

  it("marks a read notification row correctly", () => {
    const readAt = now().toISOString();
    queryState.data = {
      pages: [
        {
          notifications: [makeNotification({ id: "n3", readAt })],
          nextCursor: null,
        },
      ],
    };
    const html = renderInbox({ context: "client" });
    expect(html).toContain('data-testid="notification-row-n3-read"');
  });
});

describe("NotificationsInbox — group header", () => {
  it("renders a section-label for today's notifications", () => {
    const nowIso = now().toISOString();
    queryState.data = {
      pages: [
        {
          notifications: [makeNotification({ id: "h1", createdAt: nowIso })],
          nextCursor: null,
        },
      ],
    };
    const html = renderInbox({ context: "client" });
    // The group key for today maps to "notifications.groupToday" (shared i18n scope)
    expect(html).toContain('data-role="section-label"');
    expect(html).toContain("notifications.groupToday");
  });
});

describe("NotificationsInbox — loading state", () => {
  it("renders skeleton when loading", () => {
    queryState = {
      ...queryState,
      isLoading: true,
      data: undefined,
    };
    const html = renderInbox({ context: "client" });
    expect(html).toContain('data-testid="skeleton-list"');
  });
});

describe("NotificationsInbox — error state", () => {
  it("renders error state when query fails for client context", () => {
    queryState = {
      ...queryState,
      isLoading: false,
      isError: true,
      data: undefined,
    };
    const html = renderInbox({ context: "client" });
    expect(html).toContain("client.notifications.error");
  });

  it("renders error state when query fails for admin context", () => {
    queryState = {
      ...queryState,
      isLoading: false,
      isError: true,
      data: undefined,
    };
    const html = renderInbox({ context: "admin" });
    expect(html).toContain("admin.notifications.error");
  });
});
