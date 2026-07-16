import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { PaginatedList } from "@/components/ui/paginated-list";
import { bookingsQueries, type ClientBooking } from "@/lib/queries/bookings-queries-factory";
import { BookingRow } from "@/components/admin/booking-row";
import { TreninziSubTab } from "@/components/admin/treninzi-sub-tab";

type TreninziSub = "upcoming" | "history";

export function TreninziTab({
  upcomingQuery,
  upcomingBookings,
  clientUserId,
  bottomPad,
}: {
  upcomingQuery: ReturnType<typeof useInfiniteQuery>;
  upcomingBookings: ClientBooking[];
  clientUserId: string;
  bottomPad: number;
}) {
  const { t } = useTranslation();
  const [sub, setSub] = useState<TreninziSub>("upcoming");

  // The past-bookings query is started lazily — it only fires when the
  // history pill is tapped, so opening the tab doesn't fan out a second
  // request for a panel the user might never look at.
  const pastQuery = useInfiniteQuery({
    ...bookingsQueries.byClient({
      clientUserId,
      period: "past",
      limit: 20,
    }),
    enabled: sub === "history",
  });
  const pastBookings = (pastQuery.data?.pages ?? []).flatMap((p) => p.bookings);

  const query = sub === "upcoming" ? upcomingQuery : pastQuery;
  const data = sub === "upcoming" ? upcomingBookings : pastBookings;

  return (
    <View
      testID="client-detail-tab-content-treninzi"
      style={{ flex: 1, paddingHorizontal: 20 }}
    >
      {/* Underline tab row — quieter than chip pills, reads unambiguously
          as sub-tabs nested under the main Pregled/Paketi/Treninzi bar. */}
      <View
        className="flex-row border-b border-glass-border"
        style={{ gap: 20, marginBottom: 12 }}
      >
        <TreninziSubTab
          testID="client-detail-treninzi-pill-upcoming"
          label={t("admin.clientDetail.upcomingTab")}
          active={sub === "upcoming"}
          onPress={() => setSub("upcoming")}
        />
        <TreninziSubTab
          testID="client-detail-treninzi-pill-history"
          label={t("admin.clientDetail.historyTab")}
          active={sub === "history"}
          onPress={() => setSub("history")}
        />
      </View>
      <PaginatedList<ClientBooking>
        query={query}
        data={data}
        keyExtractor={(b) => b.id}
        renderItem={({ item }) => (
          <View
            className="bg-surface rounded-lg overflow-hidden"
            style={{ marginBottom: 8 }}
          >
            <BookingRow
              booking={item}
              showCanceledTag={sub === "history"}
            />
          </View>
        )}
        contentContainerStyle={{
          paddingBottom: bottomPad,
        }}
        errorState={
          <ErrorState
            message={t(
              sub === "upcoming"
                ? "admin.clientDetail.upcomingError"
                : "admin.history.error",
            )}
          />
        }
        emptyState={
          <EmptyState
            title={t(
              sub === "upcoming"
                ? "admin.clientDetail.noUpcoming"
                : "admin.clientDetail.noPastBookings",
            )}
          />
        }
      />
    </View>
  );
}
