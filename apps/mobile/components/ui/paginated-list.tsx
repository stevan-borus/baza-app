/**
 * <PaginatedList> — shared LegendList wrapper that absorbs the standard
 * "TanStack infinite query → onEndReached → fetchNextPage" boilerplate
 * along with default loading / empty / error states and a fetching-next
 * footer indicator.
 *
 * Sticky header lives OUTSIDE the wrapper — callers compose
 *
 *   <View>
 *     <Header />
 *     <PaginatedList … />
 *   </View>
 *
 * which keeps the search input / filter chips fixed while the list scrolls
 * underneath. The wrapper takes flex: 1 so it fills whatever space the
 * surrounding column has left over.
 *
 * Why a component and not a hook? Five screens reimplement the same plumbing
 * (Klijenti, Active Assignments, Trainer Clients, the assign-package picker,
 * Istorija treninga). A declarative wrapper lets each migration drop ~80
 * lines of glue and standardizes the behavior (threshold, footer styling,
 * skeleton fallback, keyboard-persist taps).
 */

import React, { useCallback } from "react";
import {
  ActivityIndicator,
  type RefreshControlProps,
  StyleProp,
  View,
  ViewStyle,
} from "react-native";
import type { UseInfiniteQueryResult } from "@tanstack/react-query";
import { LegendList } from "@legendapp/list/react-native";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { SkeletonCard } from "@/components/ui/skeleton";

export type PaginatedListProps<T> = {
  /**
   * TanStack infinite query result. The wrapper reads `hasNextPage`,
   * `isFetchingNextPage`, `fetchNextPage`, `isLoading`, and `isError`.
   * Typed as `unknown` so the wrapper does not constrain the page or
   * error shape — callers flatten pages.flatMap(p => p.items) themselves.
   */
  query: UseInfiniteQueryResult<unknown, unknown>;

  /** Flat array of items (caller is responsible for flattening pages). */
  data: T[];

  /** Same shape as FlatList / LegendList. */
  renderItem: (info: { item: T; index: number }) => React.ReactElement | null;

  /** Stable key per item. Required. */
  keyExtractor: (item: T, index: number) => string;

  /** Optional hairline / spacer between rows. */
  ItemSeparatorComponent?: React.ComponentType<unknown>;

  /** Rendered when data is empty AND query has loaded (not loading, not error). */
  emptyState?: React.ReactNode;

  /** Rendered when query.isError is true. */
  errorState?: React.ReactNode;

  /** Rendered while query.isLoading is true AND data is still empty. */
  loadingState?: React.ReactNode;

  /** Extra padding for the contentContainer. */
  contentContainerStyle?: StyleProp<ViewStyle>;

  /** Test ID forwarded to the underlying LegendList container. */
  testID?: string;

  /**
   * Threshold for onEndReached (fraction of viewport from bottom).
   * Default 0.4 — earlier than LegendList's own default of 0.5 so the
   * next page is in flight before the user sees a gap.
   */
  onEndReachedThreshold?: number;

  /**
   * Hint for the first render. Falls through to LegendList. Optional.
   */
  estimatedItemSize?: number;

  /**
   * Pull-to-refresh control. Forwarded straight to LegendList's inner
   * ScrollView (same prop shape as FlatList / ScrollView). Callers
   * construct the `<RefreshControl />` element themselves so tint
   * colors, onRefresh handlers, and progressViewOffset stay caller-owned.
   *
   * Why on the list and not a parent ScrollView? With a sticky header
   * above the list, wrapping the whole screen in a ScrollView defeats
   * the sticky layout. Pull-to-refresh therefore lives on the list — the
   * user pulls down on rows, not on the header (header isn't scrollable
   * anyway).
   */
  refreshControl?: React.ReactElement<RefreshControlProps>;
};

const DEFAULT_LOADING = (
  <View testID="paginated-list-loading" style={{ gap: 8 }}>
    <SkeletonCard />
    <SkeletonCard />
    <SkeletonCard />
  </View>
);

const DEFAULT_EMPTY = (
  <View testID="paginated-list-empty">
    <EmptyState title="" />
  </View>
);

const DEFAULT_ERROR = (
  <View testID="paginated-list-error">
    <ErrorState message="" />
  </View>
);

export function PaginatedList<T>(
  props: PaginatedListProps<T>,
): React.ReactElement {
  const {
    query,
    data,
    renderItem,
    keyExtractor,
    ItemSeparatorComponent,
    emptyState,
    errorState,
    loadingState,
    contentContainerStyle,
    testID,
    onEndReachedThreshold = 0.4,
    estimatedItemSize,
    refreshControl,
  } = props;

  const handleEndReached = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      query.fetchNextPage();
    }
  }, [query]);

  // ListEmptyComponent dispatches based on query state.
  // Order matters: loading wins over error wins over empty.
  let emptyComponent: React.ReactNode = null;
  if (query.isLoading && data.length === 0) {
    emptyComponent = loadingState ?? DEFAULT_LOADING;
  } else if (query.isError) {
    emptyComponent = errorState ?? DEFAULT_ERROR;
  } else {
    emptyComponent = emptyState ?? DEFAULT_EMPTY;
  }

  const footerComponent: React.ReactNode = query.isFetchingNextPage ? (
    <ActivityIndicator style={{ padding: 16 }} />
  ) : null;

  // Cast to React.ReactElement to satisfy LegendList's ListEmptyComponent /
  // ListFooterComponent prop types which only accept ReactElement, not the
  // broader ReactNode. We never pass a string here, so the cast is safe.
  return (
    <LegendList
      data={data}
      keyExtractor={keyExtractor}
      renderItem={renderItem as never}
      ItemSeparatorComponent={ItemSeparatorComponent as never}
      onEndReached={handleEndReached}
      onEndReachedThreshold={onEndReachedThreshold}
      ListEmptyComponent={emptyComponent as React.ReactElement}
      ListFooterComponent={footerComponent as React.ReactElement}
      contentContainerStyle={contentContainerStyle}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      estimatedItemSize={estimatedItemSize}
      refreshControl={refreshControl}
      style={{ flex: 1 }}
      testID={testID}
    />
  );
}
