/**
 * PaginatedList structural tests.
 *
 * The wrapper composes LegendList + standard TanStack infinite-query
 * pagination glue. These tests stub LegendList to a thin shim that
 * exercises the renderItem / ListEmptyComponent / ListFooterComponent /
 * onEndReached props and snapshots the HTML via react-dom/server.
 *
 * Why a shim rather than the real LegendList? LegendList depends on
 * react-native primitives that need a full RN runtime to measure layout —
 * unit tests are content-shape only, so we mock the list and assert on the
 * props the wrapper passes in.
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// ─── react-native mock ────────────────────────────────────────────────────
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
          style: typeof style === "object" && !Array.isArray(style) ? style : undefined,
        },
        children,
      ),
    Text: ({ children, style, className, testID, ...p }: any) =>
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
      RR.createElement("span", {
        ...p,
        "data-testid": testID ?? "activity-indicator",
        "data-role": "activity-indicator",
        style: typeof style === "object" ? style : undefined,
      }),
    Platform: { OS: "web" },
  };
});

// ─── LegendList mock ──────────────────────────────────────────────────────
// We capture the most recent props so individual tests can poke at
// onEndReached / inspect rendered footer / etc.
const lastListProps: { current: any } = { current: null };

vi.mock("@legendapp/list/react-native", () => {
  const RR = require("react");
  return {
    LegendList: (props: any) => {
      lastListProps.current = props;

      const data: any[] = props.data ?? [];
      const renderedItems = data.map((item, index) => {
        const key = props.keyExtractor
          ? props.keyExtractor(item, index)
          : String(index);
        const node = props.renderItem({ item, index });
        return RR.createElement(
          "div",
          { key, "data-row-key": key },
          node,
        );
      });

      const empty =
        data.length === 0
          ? props.ListEmptyComponent
            ? typeof props.ListEmptyComponent === "function"
              ? RR.createElement(props.ListEmptyComponent)
              : props.ListEmptyComponent
            : null
          : null;

      const footer = props.ListFooterComponent
        ? typeof props.ListFooterComponent === "function"
          ? RR.createElement(props.ListFooterComponent)
          : props.ListFooterComponent
        : null;

      return RR.createElement(
        "div",
        {
          "data-testid": props.testID,
          "data-role": "legend-list",
          "data-end-threshold": props.onEndReachedThreshold,
          "data-keyboard-should-persist-taps": props.keyboardShouldPersistTaps,
          "data-shows-vertical": String(props.showsVerticalScrollIndicator),
        },
        renderedItems,
        empty,
        footer,
      );
    },
  };
});

// ─── shared studio mocks ──────────────────────────────────────────────────
vi.mock("@/components/ui/tokens", () => ({
  useThemeTokens: () => ({
    glass: "rgba(0,0,0,0.04)",
    glassStrong: "rgba(0,0,0,0.08)",
    glassBorder: "rgba(0,0,0,0.10)",
    faint: "#999",
    danger: "#c00",
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string) => k,
  }),
}));

vi.mock("react-native-reanimated", () => {
  const RR = require("react");
  const passthrough = (tag: string) =>
    (props: any) => RR.createElement(tag, props, props.children);
  return {
    default: {
      createAnimatedComponent: () => passthrough("div"),
      View: passthrough("div"),
    },
    createAnimatedComponent: () => passthrough("div"),
    View: passthrough("div"),
    useSharedValue: (v: number) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withRepeat: (v: any) => v,
    withTiming: (v: any) => v,
    withSequence: (...v: any[]) => v,
    Easing: { inOut: () => null, ease: null },
    FadeInDown: { duration: () => ({ springify: () => null }) },
  };
});

vi.mock("@/components/ui/icon", () => ({
  Icon: () => null,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: any) => {
    const RR = require("react");
    return RR.createElement("button", null, children);
  },
}));

// ─── target ───────────────────────────────────────────────────────────────
import { PaginatedList } from "@/components/ui/paginated-list";

type Item = { id: string; label: string };

function makeQuery(overrides: Partial<any> = {}) {
  return {
    hasNextPage: false,
    isFetchingNextPage: false,
    isLoading: false,
    isError: false,
    fetchNextPage: vi.fn(),
    ...overrides,
  };
}

function renderList(props: Partial<React.ComponentProps<typeof PaginatedList<Item>>> = {}) {
  const defaults = {
    data: [
      { id: "a", label: "Alpha" },
      { id: "b", label: "Beta" },
    ] as Item[],
    query: makeQuery() as any,
    keyExtractor: (item: Item) => item.id,
    renderItem: ({ item }: { item: Item }) => {
      const RR = require("react");
      return RR.createElement(
        "span",
        { "data-testid": `row-${item.id}` },
        item.label,
      );
    },
  };
  const merged = { ...defaults, ...props } as any;
  return renderToStaticMarkup(
    React.createElement(PaginatedList as any, merged),
  );
}

describe("PaginatedList — renders items via renderItem", () => {
  it("renders all items", () => {
    const html = renderList();
    expect(html).toContain("Alpha");
    expect(html).toContain("Beta");
  });

  it("honors keyExtractor (key appears on the wrapping row)", () => {
    const html = renderList();
    expect(html).toContain('data-row-key="a"');
    expect(html).toContain('data-row-key="b"');
  });

  it("forwards testID to the underlying list", () => {
    renderList({ testID: "my-list" });
    expect(lastListProps.current.testID).toBe("my-list");
  });

  it("sets keyboardShouldPersistTaps='handled' on the list", () => {
    renderList();
    expect(lastListProps.current.keyboardShouldPersistTaps).toBe("handled");
  });

  it("hides the vertical scrollbar", () => {
    renderList();
    expect(lastListProps.current.showsVerticalScrollIndicator).toBe(false);
  });

  it("uses default onEndReachedThreshold of 0.4", () => {
    renderList();
    expect(lastListProps.current.onEndReachedThreshold).toBe(0.4);
  });

  it("respects a custom onEndReachedThreshold", () => {
    renderList({ onEndReachedThreshold: 0.7 });
    expect(lastListProps.current.onEndReachedThreshold).toBe(0.7);
  });
});

describe("PaginatedList — pagination", () => {
  it("calls fetchNextPage when onEndReached fires AND hasNextPage AND !isFetchingNextPage", () => {
    const fetchNextPage = vi.fn();
    const query = makeQuery({
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage,
    });
    renderList({ query: query as any });
    expect(lastListProps.current.onEndReached).toBeTypeOf("function");
    lastListProps.current.onEndReached({ distanceFromEnd: 100 });
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("does NOT call fetchNextPage when hasNextPage is false", () => {
    const fetchNextPage = vi.fn();
    const query = makeQuery({
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage,
    });
    renderList({ query: query as any });
    lastListProps.current.onEndReached({ distanceFromEnd: 100 });
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it("does NOT call fetchNextPage when isFetchingNextPage is true", () => {
    const fetchNextPage = vi.fn();
    const query = makeQuery({
      hasNextPage: true,
      isFetchingNextPage: true,
      fetchNextPage,
    });
    renderList({ query: query as any });
    lastListProps.current.onEndReached({ distanceFromEnd: 100 });
    expect(fetchNextPage).not.toHaveBeenCalled();
  });
});

describe("PaginatedList — footer", () => {
  it("renders an ActivityIndicator when isFetchingNextPage", () => {
    const query = makeQuery({ isFetchingNextPage: true });
    const html = renderList({ query: query as any });
    expect(html).toContain('data-role="activity-indicator"');
  });

  it("does NOT render the footer indicator when not fetching", () => {
    const query = makeQuery({ isFetchingNextPage: false });
    const html = renderList({ query: query as any });
    expect(html).not.toContain('data-role="activity-indicator"');
  });
});

describe("PaginatedList — loading / empty / error states", () => {
  it("renders skeleton loading state when isLoading AND data.length === 0", () => {
    const query = makeQuery({ isLoading: true });
    const html = renderList({ query: query as any, data: [] });
    // Default skeleton state renders 3 SkeletonCards. We assert by looking
    // for the skeleton testID we forward through.
    expect(html).toContain("paginated-list-loading");
  });

  it("renders a custom loading node when one is provided", () => {
    const query = makeQuery({ isLoading: true });
    const html = renderList({
      query: query as any,
      data: [],
      loadingState: React.createElement("span", {
        "data-testid": "custom-loading",
      }, "loading!"),
    });
    expect(html).toContain("custom-loading");
    expect(html).toContain("loading!");
  });

  it("renders the error state when query.isError", () => {
    const query = makeQuery({ isError: true });
    const html = renderList({ query: query as any, data: [] });
    expect(html).toContain("paginated-list-error");
  });

  it("renders a custom error node when one is provided", () => {
    const query = makeQuery({ isError: true });
    const html = renderList({
      query: query as any,
      data: [],
      errorState: React.createElement("span", {
        "data-testid": "custom-error",
      }, "boom"),
    });
    expect(html).toContain("custom-error");
    expect(html).toContain("boom");
  });

  it("renders the empty state when loaded with no data", () => {
    const query = makeQuery({
      isLoading: false,
      isError: false,
      hasNextPage: false,
    });
    const html = renderList({ query: query as any, data: [] });
    expect(html).toContain("paginated-list-empty");
  });

  it("renders a custom empty node when one is provided", () => {
    const query = makeQuery();
    const html = renderList({
      query: query as any,
      data: [],
      emptyState: React.createElement("span", {
        "data-testid": "custom-empty",
      }, "nothing here"),
    });
    expect(html).toContain("custom-empty");
    expect(html).toContain("nothing here");
  });

  it("does NOT render empty state when data has items", () => {
    const query = makeQuery();
    const html = renderList({ query: query as any });
    expect(html).not.toContain("paginated-list-empty");
  });

  it("loading state hides when data already has items (refetch-in-place)", () => {
    const query = makeQuery({ isLoading: true });
    const html = renderList({
      query: query as any,
      data: [{ id: "a", label: "Alpha" }],
    });
    expect(html).not.toContain("paginated-list-loading");
    expect(html).toContain("Alpha");
  });
});

describe("PaginatedList — refreshControl forwarding", () => {
  // Why: callers (Klijenti et al.) need to attach pull-to-refresh to the
  // list itself. The sticky header lives outside the list, so wrapping the
  // whole screen in a ScrollView with RefreshControl is no longer an
  // option — the wrapper must accept a refreshControl React element and
  // pass it straight to LegendList (which forwards it to its inner
  // ScrollView, identical to FlatList / SectionList semantics).
  it("forwards a provided refreshControl element to LegendList", () => {
    const RR = require("react");
    const refreshControl = RR.createElement("span", {
      "data-testid": "test-refresh-control",
    });
    renderList({ refreshControl } as any);
    expect(lastListProps.current.refreshControl).toBe(refreshControl);
  });

  it("does not set refreshControl when prop is undefined", () => {
    renderList();
    expect(lastListProps.current.refreshControl).toBeUndefined();
  });
});
