// P2-3: Past bookings sub-route — paginated infinite list of the client's
// past bookings (period=past on bookings.byClient).
//
// Migration note: the list is rendered through `<PaginatedList>` and the
// client-name subtitle lives in a fixed View ABOVE the list. The hand-rolled
// `ScrollView + onScroll → fetchNextPage` plumbing, the ActivityIndicator
// footer, and the skeleton/empty/error fallbacks are gone — the wrapper owns
// all of them.

import React from "react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { PaginatedList } from "@/components/ui/paginated-list";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";
import { bookingsQueries } from "@/lib/queries/bookings-queries-factory";
import { BookingRow } from "@/components/admin/booking-row";

export default function AdminClientHistory() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const bottomPad = useTabBarBottomPadding();

  // Subtitle: client's fullName — same fetch path as the detail page so the
  // cache is shared and the route loads instantly when navigated to from there.
  const clientQuery = useQuery(clientsQueries.byId(id));
  const client = clientQuery.data?.client;

  const pastQuery = useInfiniteQuery({
    ...bookingsQueries.byClient({ clientUserId: id, period: "past", limit: 20 }),
    enabled: !!id,
  });

  const pastBookings = React.useMemo(() => {
    const pages = pastQuery.data?.pages ?? [];
    return pages.flatMap((p) => p.bookings);
  }, [pastQuery.data?.pages]);

  type Booking = (typeof pastBookings)[number];

  return (
    <ScreenContainerRaw
      title={t("admin.clientDetail.viewHistory")}
      headerVariant="detail"
    >
      <View style={{ flex: 1 }}>
        {/* ── Sticky header ──────────────────────────────────────────────────
            Just the client-name subtitle — no search, no filters on this
            route. Lives OUTSIDE the list so it stays pinned while rows
            scroll underneath. */}
        {client ? (
          <View
            style={{
              paddingTop: 16,
              paddingHorizontal: 20,
              paddingBottom: 12,
            }}
          >
            <Text
              testID="client-history-subtitle"
              className="text-muted"
              style={{ fontSize: 13 }}
              numberOfLines={1}
            >
              {client.user.fullName}
            </Text>
          </View>
        ) : null}

        {/* ── List body ─────────────────────────────────────────────────────
            The wrapper owns loading / empty / error / fetch-next-page footer
            states. Rows render flush with a 1px hairline divider between
            them, wrapped in a rounded surface container via the
            contentContainerStyle. */}
        <PaginatedList<Booking>
          query={pastQuery}
          data={pastBookings}
          keyExtractor={(b) => b.id}
          renderItem={({ item, index }) => (
            <View>
              {index > 0 ? (
                <View
                  className="bg-glass-border"
                  style={{ height: 1, marginLeft: 16 }}
                />
              ) : null}
              <BookingRow booking={item} showCanceledTag />
            </View>
          )}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: bottomPad,
          }}
          errorState={<ErrorState message={t("admin.clientDetail.upcomingError")} />}
          emptyState={<EmptyState title={t("admin.clientDetail.noPastBookings")} />}
        />
      </View>
    </ScreenContainerRaw>
  );
}
