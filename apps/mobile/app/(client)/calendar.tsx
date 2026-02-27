import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, type ICalendarEventBase } from "react-native-big-calendar";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { Text, XStack, YStack } from "tamagui";
import { useCalendarTheme } from "@/lib/calendar-theme";
import { AppSheet } from "@/components/ui/sheet";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorState, ListRow } from "@/components/ui/states";
import { ScreenContainerRaw } from "@/components/ui/screen-container";
import { SectionHeader } from "@/components/ui/typography";
import { getDateLocale } from "@/lib/i18n";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
import { bookingsQueries } from "@/lib/queries/bookings-queries-factory";

interface SessionEvent extends ICalendarEventBase {
  sessionId: string;
  classTypeName: string;
  roomName: string | null;
  availableSlots: number;
  waitlistCount: number;
  capacity: number;
  bookedCount: number;
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

const bookingStateColor = {
  BOOKED: "$accent1",
  BOOKED_ALREADY: "$accent8",
  WAITLISTED: "$yellow10",
  WAITLIST_PROMOTED: "$accent1",
  CANCELED: "$color10",
} as const;

const BOOKING_STATE_KEYS: Record<string, string> = {
  BOOKED: "client.calendar.bookingBooked",
  BOOKED_ALREADY: "client.calendar.bookingBookedAlready",
  WAITLISTED: "client.calendar.bookingWaitlisted",
  WAITLIST_PROMOTED: "client.calendar.bookingWaitlistPromoted",
  CANCELED: "client.calendar.bookingCanceled",
};

export default function ClientCalendar() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(() => currentMonthKey());
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<SessionEvent | null>(null);
  const locale = getDateLocale().startsWith("en") ? "en" : "sr";
  const cal = useCalendarTheme();

  const availabilityQuery = useQuery(sessionsQueries.availabilityByMonth(month));

  const bookingMutation = useMutation({
    ...bookingsQueries.mutateBooking(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["sessions", "availability", month] });
      await queryClient.invalidateQueries({ queryKey: ["packages"] });
    },
  });

  const events: SessionEvent[] = (availabilityQuery.data?.sessions ?? []).map((s) => ({
    sessionId: s.id,
    title: `${s.classTypeName} (${s.availableSlots} ${t("client.calendar.slotsShort")})`,
    start: new Date(s.startsAt),
    end: new Date(s.endsAt),
    classTypeName: s.classTypeName,
    roomName: s.roomName,
    availableSlots: s.availableSlots,
    waitlistCount: s.waitlistCount,
    capacity: s.capacity,
    bookedCount: s.bookedCount,
  }));

  function handleDateChange(date: Date) {
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    if (key !== month) setMonth(key);
    setCalendarDate(date);
  }

  const bookingResultState = bookingMutation.data?.state as string | undefined;

  return (
    <ScreenContainerRaw>
      <YStack px="$6" gap="$4" pb="$2">
        <SectionHeader
          title={t("client.calendar.title")}
          subtitle={t("client.calendar.description")}
        />
      </YStack>

      {availabilityQuery.isError ? (
        <YStack px="$6" pt="$3">
          <ErrorState message={t("client.calendar.errorSlots")} />
        </YStack>
      ) : null}

      {bookingMutation.isSuccess && bookingResultState ? (
        <YStack px="$6" py="$3">
          <YStack
            bg={bookingResultState === "CANCELED" ? "$backgroundHover" : "$green3"}
            rounded="$3"
            p="$4"
          >
            <Text
              fontWeight="600"
              color={
                bookingResultState &&
                Object.prototype.hasOwnProperty.call(bookingStateColor, bookingResultState)
                  ? bookingStateColor[bookingResultState as keyof typeof bookingStateColor]
                  : "$color"
              }
            >
              {BOOKING_STATE_KEYS[bookingResultState] ? t(BOOKING_STATE_KEYS[bookingResultState]) : bookingResultState}
            </Text>
            {bookingResultState === "WAITLISTED" ? (
              <Text fontSize="$2" color="$color10" mt="$1">
                {t("client.calendar.waitlistNote")}
              </Text>
            ) : null}
          </YStack>
        </YStack>
      ) : null}
      {bookingMutation.isError ? (
        <YStack px="$6">
          <ErrorState message={t("client.calendar.bookingError")} />
        </YStack>
      ) : null}

      <YStack flex={1} minHeight={500} px="$6" pb="$3">
        <Card>
          <Calendar
            events={events}
            height={480}
            mode="month"
            theme={cal.calendarTheme}
            calendarContainerStyle={cal.calendarContainerStyle}
            bodyContainerStyle={cal.bodyContainerStyle}
            headerContainerStyle={cal.headerContainerStyle}
            eventCellStyle={cal.eventCellStyle}
            eventCellTextColor={cal.eventCellTextColor}
            calendarCellStyle={cal.calendarCellStyle}
            calendarCellTextStyle={cal.calendarCellTextStyle}
            date={calendarDate}
            onPressEvent={(event) => setSelectedEvent(event as SessionEvent)}
            onSwipeEnd={handleDateChange}
            swipeEnabled
            weekStartsOn={1}
            locale={locale}
          />
        </Card>
      </YStack>

      <AppSheet open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
        {selectedEvent ? (
          <YStack gap="$5">
            <Text fontSize="$6" fontWeight="700" color="$color" letterSpacing={-0.3}>
              {selectedEvent.classTypeName}
            </Text>
            <Card>
              <YStack gap="$3">
                <ListRow
                  title={`${dayjs(selectedEvent.start).format("DD.MM.YYYY HH:mm")} - ${dayjs(selectedEvent.end).format("HH:mm")}`}
                  subtitle={`${t("client.calendar.room")}: ${selectedEvent.roomName ?? "—"}`}
                />
                <XStack gap="$2">
                  <Badge
                    variant="soft"
                    color={selectedEvent.availableSlots > 0 ? "$accent3" : "$red3"}
                  >
                    {selectedEvent.availableSlots > 0
                      ? t("client.calendar.availableSlots", { count: selectedEvent.availableSlots })
                      : t("client.calendar.full")}
                  </Badge>
                  {selectedEvent.waitlistCount > 0 ? (
                    <Badge variant="soft" color="$yellow3">
                      {t("client.calendar.waitlistShort", { count: selectedEvent.waitlistCount })}
                    </Badge>
                  ) : null}
                </XStack>
              </YStack>
            </Card>
            <XStack gap="$3">
              <Button
                flex={1}
                disabled={bookingMutation.isPending}
                onPress={() => {
                  bookingMutation.mutate({ sessionId: selectedEvent.sessionId, action: "BOOK" });
                  setSelectedEvent(null);
                }}
              >
                {t("client.calendar.book")}
              </Button>
              <Button
                flex={1}
                variant="danger"
                disabled={bookingMutation.isPending}
                onPress={() => {
                  bookingMutation.mutate({ sessionId: selectedEvent.sessionId, action: "CANCEL" });
                  setSelectedEvent(null);
                }}
              >
                {t("client.calendar.cancel")}
              </Button>
            </XStack>
          </YStack>
        ) : null}
      </AppSheet>
    </ScreenContainerRaw>
  );
}
