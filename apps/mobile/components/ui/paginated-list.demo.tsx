/**
 * <PaginatedList> demonstration / smoke-test screen.
 *
 * NOT wired into any route. This file exists as documentation: it shows
 * the canonical sticky-header-above + list-below composition, with a
 * tiny in-memory "infinite query" stub so the wrapper can be exercised
 * without the real API.
 *
 * Open this file when migrating a screen — it captures the conventions:
 *
 *   1. Sticky header (search input + filter chips) is rendered OUTSIDE
 *      the list, inside the parent <View>.
 *   2. The wrapper takes flex: 1 and fills whatever space the column
 *      has left over.
 *   3. The caller flattens `data?.pages.flatMap(p => p.items)` itself.
 *   4. `query.fetchNextPage()` is called automatically when the user
 *      scrolls to within ~40% of the bottom — no manual onScroll math.
 *
 * If you want to play with this in a sandbox, copy it onto a temporary
 * route. Do NOT commit a route reference to this file.
 */

import React, { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { PaginatedList } from "@/components/ui/paginated-list";

// ─── mock domain ──────────────────────────────────────────────────────────

type DemoItem = {
  id: string;
  title: string;
  subtitle: string;
};

const PAGE_SIZE = 10;
const TOTAL = 50;

function makePage(pageIndex: number): { items: DemoItem[]; nextCursor: number | null } {
  const start = pageIndex * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, TOTAL);
  const items: DemoItem[] = [];
  for (let i = start; i < end; i++) {
    items.push({
      id: `item-${i}`,
      title: `Item ${i + 1}`,
      subtitle: `Subtitle for row ${i + 1}`,
    });
  }
  const nextCursor = end < TOTAL ? pageIndex + 1 : null;
  return { items, nextCursor };
}

// ─── mock infinite query ──────────────────────────────────────────────────
//
// We hand-roll a TanStack-shaped object instead of plumbing in QueryClient
// for this demo. Real screens use `useInfiniteQuery` from `@tanstack/react-query`.

function useDemoInfiniteQuery() {
  const [pages, setPages] = useState<ReturnType<typeof makePage>[]>(() => [
    makePage(0),
  ]);
  const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);

  const lastPage = pages[pages.length - 1];
  const hasNextPage = lastPage.nextCursor !== null;

  const fetchNextPage = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    setIsFetchingNextPage(true);
    // Simulate network latency.
    setTimeout(() => {
      setPages((prev) => {
        const next = prev[prev.length - 1].nextCursor;
        if (next === null) return prev;
        return [...prev, makePage(next)];
      });
      setIsFetchingNextPage(false);
    }, 350);
  }, [hasNextPage, isFetchingNextPage]);

  const data = useMemo(() => pages.flatMap((p) => p.items), [pages]);

  // Loose-typed for the demo — real screens get the precise TanStack types.
  const query = {
    hasNextPage,
    isFetchingNextPage,
    isLoading: false,
    isError: false,
    fetchNextPage,
  } as unknown as Parameters<typeof PaginatedList<DemoItem>>[0]["query"];

  return { query, data };
}

// ─── rows ─────────────────────────────────────────────────────────────────

function DemoRow({ item }: { item: DemoItem }) {
  return (
    <View className="px-5 py-1">
      <GlassCard size="md">
        <View>
          <Text className="text-foreground font-body-semibold text-base">
            {item.title}
          </Text>
          <Text className="text-muted text-sm">{item.subtitle}</Text>
        </View>
      </GlassCard>
    </View>
  );
}

// ─── demo screen ──────────────────────────────────────────────────────────

const FILTERS = ["All", "Recent", "Pinned"] as const;
type Filter = (typeof FILTERS)[number];

export function PaginatedListDemo() {
  const { query, data } = useDemoInfiniteQuery();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("All");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (it) =>
        it.title.toLowerCase().includes(q) ||
        it.subtitle.toLowerCase().includes(q),
    );
  }, [data, search]);

  return (
    <View className="flex-1 bg-background">
      {/* ── Sticky header (lives OUTSIDE the list) ── */}
      <View className="px-5 pt-4 pb-3 gap-3">
        <Input
          placeholder="Search…"
          leftIcon="search"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View className="flex-row gap-2">
          {FILTERS.map((f) => {
            const active = f === filter;
            return (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-full ${
                  active ? "bg-accent" : "bg-glass"
                }`}
              >
                <Text
                  className={`text-sm font-body-medium ${
                    active ? "text-accent-fg" : "text-foreground"
                  }`}
                >
                  {f}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── List (fills remaining space) ── */}
      <PaginatedList<DemoItem>
        query={query}
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <DemoRow item={item} />}
        estimatedItemSize={80}
        contentContainerStyle={{ paddingVertical: 8 }}
        testID="paginated-list-demo"
      />
    </View>
  );
}
