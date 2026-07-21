/**
 * PaginatedList behavior tests — real LegendList in the browser.
 *
 * The `query` prop is the component's declared public interface (it reads
 * hasNextPage / isFetchingNextPage / fetchNextPage / isLoading / isError),
 * so tests hand it plain objects of that shape and assert what the USER
 * sees: rows, state fallbacks, the fetching footer. The old static suite
 * asserted prop-forwarding into a mocked list — implementation, not
 * behavior, and it's dropped without replacement on purpose.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { View } from "react-native";
import type { UseInfiniteQueryResult } from "@tanstack/react-query";
import { PaginatedList } from "@/components/ui/paginated-list";

type Item = { id: string; label: string };

function makeQuery(overrides: Record<string, unknown> = {}) {
  return {
    hasNextPage: false,
    isFetchingNextPage: false,
    isLoading: false,
    isError: false,
    fetchNextPage: vi.fn(),
    ...overrides,
  } as unknown as UseInfiniteQueryResult<unknown, unknown>;
}

function renderList(
  props: Partial<React.ComponentProps<typeof PaginatedList<Item>>> = {},
) {
  const defaults: React.ComponentProps<typeof PaginatedList<Item>> = {
    data: [
      { id: "a", label: "Alpha" },
      { id: "b", label: "Beta" },
    ],
    query: makeQuery(),
    keyExtractor: (item) => item.id,
    renderItem: ({ item }) => (
      <View testID={`row-${item.id}`} style={{ height: 40 }}>
        <React.Fragment>{item.label}</React.Fragment>
      </View>
    ),
  };
  // LegendList needs a measurable viewport to lay out rows.
  return render(
    <View style={{ height: 400 }}>
      <PaginatedList {...defaults} {...props} />
    </View>,
  );
}

describe("PaginatedList — items", () => {
  it("renders every item through renderItem", async () => {
    const screen = renderList();
    expect(await screen.findByText("Alpha")).toBeTruthy();
    expect(await screen.findByText("Beta")).toBeTruthy();
  });
});

describe("PaginatedList — state fallbacks", () => {
  it("shows the skeleton loading state while loading with no data", () => {
    const screen = renderList({ query: makeQuery({ isLoading: true }), data: [] });
    expect(screen.getByTestId("paginated-list-loading")).toBeTruthy();
  });

  it("shows a custom loading node when provided", () => {
    const screen = renderList({
      query: makeQuery({ isLoading: true }),
      data: [],
      loadingState: <View testID="custom-loading" />,
    });
    expect(screen.getByTestId("custom-loading")).toBeTruthy();
    expect(screen.queryByTestId("paginated-list-loading")).toBeNull();
  });

  it("shows the error state when the query errored", () => {
    const screen = renderList({ query: makeQuery({ isError: true }), data: [] });
    expect(screen.getByTestId("paginated-list-error")).toBeTruthy();
  });

  it("shows a custom error node when provided", () => {
    const screen = renderList({
      query: makeQuery({ isError: true }),
      data: [],
      errorState: <View testID="custom-error" />,
    });
    expect(screen.getByTestId("custom-error")).toBeTruthy();
  });

  it("loading wins over error when both are set", () => {
    const screen = renderList({
      query: makeQuery({ isLoading: true, isError: true }),
      data: [],
    });
    expect(screen.getByTestId("paginated-list-loading")).toBeTruthy();
    expect(screen.queryByTestId("paginated-list-error")).toBeNull();
  });

  it("shows the empty state once loaded with no data", () => {
    const screen = renderList({ query: makeQuery(), data: [] });
    expect(screen.getByTestId("paginated-list-empty")).toBeTruthy();
  });

  it("shows a custom empty node when provided", () => {
    const screen = renderList({
      query: makeQuery(),
      data: [],
      emptyState: <View testID="custom-empty" />,
    });
    expect(screen.getByTestId("custom-empty")).toBeTruthy();
  });

  it("shows no empty state when items exist", async () => {
    const screen = renderList();
    await screen.findByText("Alpha");
    expect(screen.queryByTestId("paginated-list-empty")).toBeNull();
  });

  it("keeps rows (no skeleton) when a refetch happens with data on screen", async () => {
    const screen = renderList({
      query: makeQuery({ isLoading: true }),
      data: [{ id: "a", label: "Alpha" }],
    });
    expect(await screen.findByText("Alpha")).toBeTruthy();
    expect(screen.queryByTestId("paginated-list-loading")).toBeNull();
  });
});

describe("PaginatedList — next-page footer", () => {
  it("shows a spinner while the next page is fetching", async () => {
    const screen = renderList({ query: makeQuery({ isFetchingNextPage: true }) });
    await screen.findByText("Alpha");
    expect(
      screen.container.querySelector('[role="progressbar"]'),
    ).toBeTruthy();
  });

  it("shows no spinner otherwise", async () => {
    const screen = renderList();
    await screen.findByText("Alpha");
    expect(screen.container.querySelector('[role="progressbar"]')).toBeNull();
  });
});

describe("PaginatedList — end-reached pagination", () => {
  const manyItems = Array.from({ length: 40 }, (_, i) => ({
    id: `item-${i}`,
    label: `Item ${i}`,
  }));

  function scrollToBottom(container: HTMLElement) {
    const scroller = Array.from(container.querySelectorAll("div")).find(
      (el) => el.scrollHeight > el.clientHeight && el.clientHeight > 0,
    );
    if (!scroller) throw new Error("no scrollable element found");
    scroller.scrollTop = scroller.scrollHeight;
    scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
  }

  it("fetches the next page when scrolled to the end and one exists", async () => {
    const fetchNextPage = vi.fn();
    const screen = renderList({
      data: manyItems,
      query: makeQuery({ hasNextPage: true, fetchNextPage }),
    });
    await screen.findByText("Item 0");

    scrollToBottom(screen.container);
    await vi.waitFor(() => expect(fetchNextPage).toHaveBeenCalled());
  });

  it("does not fetch when there is no next page", async () => {
    const fetchNextPage = vi.fn();
    const screen = renderList({
      data: manyItems,
      query: makeQuery({ hasNextPage: false, fetchNextPage }),
    });
    await screen.findByText("Item 0");

    scrollToBottom(screen.container);
    // Give any listener a tick to fire before asserting silence.
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it("does not double-fetch while a next page is already in flight", async () => {
    const fetchNextPage = vi.fn();
    const screen = renderList({
      data: manyItems,
      query: makeQuery({
        hasNextPage: true,
        isFetchingNextPage: true,
        fetchNextPage,
      }),
    });
    await screen.findByText("Item 0");

    scrollToBottom(screen.container);
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchNextPage).not.toHaveBeenCalled();
  });
});
