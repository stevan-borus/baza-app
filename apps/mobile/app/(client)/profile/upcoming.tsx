/**
 * Client upcoming sessions — all future booked sessions, grouped by day,
 * cancelable in place.
 *
 * Clients could previously only cancel a booking by hunting for its day in
 * the calendar. This surfaces every upcoming booking in one list (grouped by
 * calendar day, "Danas / Sutra / Sre, 16.7.") and reuses the SAME booking
 * sheet the calendar/home use — so the client still sees the late-cancel
 * forfeit warning before giving up a spot.
 *
 * Cancel hydration: the booking-sheet operates on an AvailabilitySession
 * (which carries lateCancelHours/capacity/bookedCount the forfeit warning
 * needs), NOT the ClientBooking this list renders. We load availability for
 * the current month plus the next two (a fixed 3-query ceiling — upcoming
 * bookings realistically span that far) and look the tapped booking up by
 * session id. Found → full sheet with the warning. Not found (a booking
 * further out than we loaded) → a plain confirm sheet that cancels directly.
 * Either path hits the same mutation, which invalidates ["bookings"], so the
 * list refreshes itself — no manual refetch.
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
import { ConfirmSheet } from "@/components/ui/confirm-sheet";
import { BookingRow } from "@/components/admin/booking-row";
import {
  useBookingSheet,
  ClientBookingSheet,
} from "@/components/client/use-booking-sheet";
import { now } from "@/lib/now";
import {
  buildUpcomingListItems,
  type UpcomingListItem,
} from "@/lib/group-upcoming-bookings";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
import {
  bookingsQueries,
  useMutateBookingMutation,
  type ClientBooking,
} from "@/lib/queries/bookings-queries-factory";

/** Fixed 3-month window from today, as `availabilityByMonth` keys ("YYYY-MM").
 *  Hooks can't be looped over a dynamic count, so the ceiling is baked in. */
function monthKeysFromNow(nowDate: Date): [string, string, string] {
  const base = dayjs(nowDate).startOf("month");
  return [0, 1, 2].map((i) =>
    base.add(i, "month").format("YYYY-MM"),
  ) as [string, string, string];
}

export default function ClientUpcomingSessions() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "sr";
  const bottomPad = useTabBarBottomPadding();
  const nowDate = now();

  const meQuery = useQuery(authQueries.me());
  const userId = meQuery.data?.user.id;

  const upcomingQuery = useInfiniteQuery({
    ...bookingsQueries.byClient({
      clientUserId: userId ?? "",
      period: "upcoming",
      limit: 20,
    }),
    enabled: !!userId,
  });

  // Availability for the current month + next two — the sheet's forfeit
  // warning needs the AvailabilitySession shape, which the bookings list
  // doesn't carry. Three fixed queries keeps the hook count stable.
  const [m0, m1, m2] = monthKeysFromNow(nowDate);
  const avail0 = useQuery(sessionsQueries.availabilityByMonth(m0));
  const avail1 = useQuery(sessionsQueries.availabilityByMonth(m1));
  const avail2 = useQuery(sessionsQueries.availabilityByMonth(m2));

  const availabilitySessions = React.useMemo(
    () => [
      ...(avail0.data?.sessions ?? []),
      ...(avail1.data?.sessions ?? []),
      ...(avail2.data?.sessions ?? []),
    ],
    [avail0.data?.sessions, avail1.data?.sessions, avail2.data?.sessions],
  );

  const booking = useBookingSheet();
  const cancelMutation = useMutateBookingMutation();
  const [fallbackBooking, setFallbackBooking] =
    React.useState<ClientBooking | null>(null);

  const items = React.useMemo(() => {
    const pages = upcomingQuery.data?.pages ?? [];
    const bookings = pages.flatMap((p) => p.bookings);
    return buildUpcomingListItems(bookings, lang, nowDate, {
      today: t("client.home.today"),
      tomorrow: t("client.home.tomorrow"),
    });
  }, [upcomingQuery.data?.pages, lang, nowDate, t]);

  function handleBookingPress(b: ClientBooking) {
    // Preferred path: the booking is inside a loaded availability month, so
    // open the full sheet (forfeit warning lives one tap deeper on the cancel
    // step). Open on the OVERVIEW, not straight on the confirmation: a client
    // reaching a booking from this list is reviewing it, not necessarily
    // cancelling — the single "Otkaži" button that expands to Potvrdi / Nazad
    // matches the calendar and doesn't read as if we assume they want out.
    const match = availabilitySessions.find((s) => s.id === b.session.id);
    if (match) {
      booking.open(match);
      return;
    }
    // Fallback: booking is further out than we loaded — a plain confirm sheet
    // that cancels directly. No forfeit math, but it never blocks the client.
    setFallbackBooking(b);
  }

  function confirmFallbackCancel() {
    if (!fallbackBooking) return;
    cancelMutation.mutate(
      { sessionId: fallbackBooking.session.id, action: "CANCEL" },
      { onSuccess: () => setFallbackBooking(null) },
    );
  }

  return (
    <ScreenContainerRaw
      title={t("client.upcoming.title")}
      headerVariant="detail"
    >
      <View style={{ flex: 1 }}>
        <PaginatedList<UpcomingListItem>
          query={upcomingQuery}
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
                <BookingRow
                  booking={item.booking}
                  onPress={() => handleBookingPress(item.booking)}
                  accessibilityLabel={t("client.upcoming.rowHint", {
                    session: item.booking.session.classType.name,
                  })}
                />
              </View>
            )
          }
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: bottomPad,
          }}
          errorState={<ErrorState message={t("client.upcoming.error")} />}
          emptyState={<EmptyState title={t("client.upcoming.empty")} />}
        />
      </View>

      {/* Full sheet — forfeit warning path (booking within loaded months). */}
      <ClientBookingSheet controller={booking} sessions={availabilitySessions} />

      {/* Fallback confirm — booking outside the loaded availability window. */}
      <ConfirmSheet
        open={!!fallbackBooking}
        onOpenChange={(open) => {
          if (!open) setFallbackBooking(null);
        }}
        title={t("client.upcoming.cancelTitle")}
        message={
          fallbackBooking
            ? t("client.upcoming.cancelMessage", {
                session: fallbackBooking.session.classType.name,
                date: dayjs(fallbackBooking.session.startsAt)
                  .locale(lang)
                  .format("ddd, D.M. HH:mm"),
              })
            : undefined
        }
        confirmLabel={t("client.upcoming.cancelConfirm")}
        loading={cancelMutation.isPending}
        onConfirm={confirmFallbackCancel}
      />
    </ScreenContainerRaw>
  );
}
