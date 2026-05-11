// P2-3: Past bookings sub-route — paginated infinite list of the client's
// past bookings (period=past on bookings.byClient). Mirrors the
// naplata/index.tsx infinite-scroll pattern (ScrollView + onScroll instead of
// FlatList) so we stay consistent with the rest of the admin shell — see
// apps/mobile/app/(admin)/naplata/index.tsx for the canonical example.

import React from "react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { SkeletonCard } from "@/components/ui/skeleton";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
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

  function handleEndReached() {
    if (pastQuery.hasNextPage && !pastQuery.isFetchingNextPage) {
      pastQuery.fetchNextPage();
    }
  }

  return (
    <ScreenContainerRaw
      title={t("admin.clientDetail.viewHistory")}
      headerVariant="detail"
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={({ nativeEvent }) => {
          // Infinite scroll: trigger when within 200px of the bottom (same
          // threshold as naplata/index.tsx).
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          if (
            layoutMeasurement.height + contentOffset.y >=
            contentSize.height - 200
          ) {
            handleEndReached();
          }
        }}
        scrollEventThrottle={400}
        contentContainerStyle={{
          paddingTop: 16,
          paddingHorizontal: 20,
          paddingBottom: bottomPad,
          gap: 12,
        }}
      >
        {/* Subtitle so the admin knows whose history they're viewing. */}
        {client ? (
          <Text
            testID="client-history-subtitle"
            className="text-muted"
            style={{ fontSize: 13 }}
            numberOfLines={1}
          >
            {client.user.fullName}
          </Text>
        ) : null}

        {pastQuery.isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : null}

        {pastQuery.isError ? (
          <ErrorState message={t("admin.clientDetail.upcomingError")} />
        ) : null}

        {!pastQuery.isLoading && !pastQuery.isError && pastBookings.length === 0 ? (
          <EmptyState title={t("admin.clientDetail.noPastBookings")} />
        ) : null}

        {pastBookings.length > 0 ? (
          <View className="bg-surface rounded-lg overflow-hidden">
            {pastBookings.map((b, idx) => (
              <React.Fragment key={b.id}>
                {idx > 0 ? (
                  <View
                    className="bg-glass-border"
                    style={{ height: 1, marginLeft: 16 }}
                  />
                ) : null}
                <BookingRow booking={b} showCanceledTag />
              </React.Fragment>
            ))}
            {pastQuery.isFetchingNextPage ? (
              <ActivityIndicator style={{ padding: 16 }} />
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </ScreenContainerRaw>
  );
}
