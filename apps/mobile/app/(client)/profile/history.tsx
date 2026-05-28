/**
 * Client training history — paginated past bookings, grouped by month.
 *
 * Replaces the earlier notes-driven 'Istorija treninga' surface (removed in
 * PR #41 so clients no longer see trainer notes). Past sessions stay
 * visible because they're the client's own record of what they did.
 *
 * Layout: each month gets a CapsLabel band ("MAJ 2026") followed by that
 * month's session cards. The month bands are inlined into the LegendList's
 * data array as sentinel items, which lets us keep PaginatedList's
 * infinite-scroll plumbing instead of switching to SectionList (and its
 * separate paging story).
 */
import React from "react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import dayjs from "dayjs";
import { CapsLabel } from "@/components/ui/studio";
import { EmptyState, ErrorState } from "@/components/ui/states";
import {
  ScreenContainerRaw,
  useTabBarBottomPadding,
} from "@/components/ui/screen-container";
import { PaginatedList } from "@/components/ui/paginated-list";
import { BookingRow } from "@/components/admin/booking-row";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import {
  bookingsQueries,
  type ClientBooking,
} from "@/lib/queries/bookings-queries-factory";

type ListItem =
  | { kind: "header"; id: string; label: string }
  | { kind: "booking"; id: string; booking: ClientBooking };

/**
 * Walk the bookings (already sorted newest-first by the server) and emit a
 * flat array with a header sentinel each time the month boundary changes.
 * Locale-aware so the band reads "MAJ 2026" in Serbian and "MAY 2026" in
 * English — dayjs handles the casing via .toUpperCase() since some locale
 * data ships lowercase month names.
 */
function buildListItems(
  bookings: ClientBooking[],
  lang: "sr" | "en",
): ListItem[] {
  const items: ListItem[] = [];
  let currentKey: string | null = null;
  for (const booking of bookings) {
    const date = dayjs(booking.session.startsAt).locale(lang);
    const key = date.format("YYYY-MM");
    if (key !== currentKey) {
      currentKey = key;
      items.push({
        kind: "header",
        id: `header-${key}`,
        label: date.format("MMMM YYYY").toUpperCase(),
      });
    }
    items.push({ kind: "booking", id: booking.id, booking });
  }
  return items;
}

export default function ClientTrainingHistory() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "sr";
  const bottomPad = useTabBarBottomPadding();
  const meQuery = useQuery(authQueries.me());
  const userId = meQuery.data?.user.id;

  const pastQuery = useInfiniteQuery({
    ...bookingsQueries.byClient({
      clientUserId: userId ?? "",
      period: "past",
      limit: 20,
    }),
    enabled: !!userId,
  });

  const items = React.useMemo(() => {
    const pages = pastQuery.data?.pages ?? [];
    const bookings = pages.flatMap((p) => p.bookings);
    return buildListItems(bookings, lang);
  }, [pastQuery.data?.pages, lang]);

  return (
    <ScreenContainerRaw
      title={t("client.profileTab.trainingHistory")}
      headerVariant="detail"
    >
      <View style={{ flex: 1 }}>
        <PaginatedList<ListItem>
          query={pastQuery}
          data={items}
          keyExtractor={(it) => it.id}
          renderItem={({ item }) =>
            item.kind === "header" ? (
              <View style={{ paddingTop: 20, paddingBottom: 8 }}>
                <CapsLabel size={11} tracking={1.6} className="text-muted">
                  {item.label}
                </CapsLabel>
              </View>
            ) : (
              <View
                className="bg-surface rounded-lg overflow-hidden"
                style={{ marginBottom: 8 }}
              >
                <BookingRow booking={item.booking} showCanceledTag />
              </View>
            )
          }
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: bottomPad,
          }}
          errorState={<ErrorState message={t("client.history.error")} />}
          emptyState={<EmptyState title={t("client.history.empty")} />}
        />
      </View>
    </ScreenContainerRaw>
  );
}
