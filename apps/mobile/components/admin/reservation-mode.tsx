/**
 * Reservation mode — admin-only screen bound to one Client. Two ways to
 * populate the selection set: tap session cards in the calendar, or apply
 * a weekly/biweekly pattern via the accelerator sheet. Both feed the same
 * `selectedSessionIds` set. Past sessions are selectable (admins backfill).
 *
 * The route is gated to ADMIN — trainers and clients hitting
 * /klijenti/rezervisi get redirected to their home tab.
 */
import React, { useState, useEffect } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import dayjs from "dayjs";
import Feather from "@expo/vector-icons/Feather";
import { AppSheet } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CapsLabel } from "@/components/ui/studio/typography";
import { SessionCard } from "@/components/ui/session-card";
import { StudioWeekStrip } from "@/components/ui/studio";
import { startOfLocaleWeek } from "@/components/ui/week-strip";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { EmptyState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { FilterChip } from "@/components/ui/studio/filter-chip";
import { nowMs } from "@/lib/now";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import { expandPattern, type PatternInput, type RhythmWeek } from "@/lib/reservation-pattern";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";
import { packagesQueries } from "@/lib/queries/packages-queries-factory";
import { bookingsQueries } from "@/lib/queries/bookings-queries-factory";
import {
  useCreateReservationsMutation,
  useCancelReservationsBulkMutation,
} from "@/lib/queries/reservations-queries-factory";

type AvailabilitySession = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  classTypeName: string;
  trainerName?: string | null;
  roomName?: string | null;
  bookedCount: number;
  availableSlots: number;
  isActive?: boolean;
};

type ReservationModeParams = {
  clientProfileId?: string;
  clientUserId?: string;
  clientFullName?: string;
};

const WEEKDAY_LABELS_SR = ["P", "U", "S", "Č", "P", "S", "N"]; // Mon..Sun
const WEEKDAY_LABELS_EN = ["M", "T", "W", "T", "F", "S", "S"];
const CARD_RADIUS = 20; // matches GlassCard size="md"

export function ReservationMode() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "sr";
  const router = useRouter();
  const bottomPad = useTabBarBottomPadding(80);
  const params = useLocalSearchParams<ReservationModeParams>();

  // Role gate — trainers and clients land here only by typing the URL.
  const meQ = useQuery(authQueries.me());
  useEffect(() => {
    const role = meQ.data?.user?.role;
    if (!role) return;
    if (role === "TRAINER") router.replace("/(trainer)/raspored" as Href);
    else if (role === "CLIENT") router.replace("/(client)" as Href);
  }, [meQ.data, router]);

  const [mode, setMode] = useState<"reserve" | "cancel">("reserve");
  const [clientProfileId, setClientProfileId] = useState<string | null>(
    params.clientProfileId ?? null,
  );
  const [clientUserId, setClientUserId] = useState<string | null>(
    params.clientUserId ?? null,
  );
  const [clientFullName, setClientFullName] = useState<string | null>(
    params.clientFullName ?? null,
  );

  // Keep state in sync if the route params change (e.g. opening from a
  // different client profile without remount).
  useEffect(() => {
    if (params.clientProfileId && params.clientProfileId !== clientProfileId) {
      setClientProfileId(params.clientProfileId);
      setClientUserId(params.clientUserId ?? null);
      setClientFullName(params.clientFullName ?? null);
    }
  }, [params.clientProfileId, params.clientUserId, params.clientFullName, clientProfileId]);

  const [selectedDate, setSelectedDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [weekStart, setWeekStart] = useState(() => startOfLocaleWeek(dayjs()));
  const [month, setMonth] = useState(() => dayjs().format("YYYY-MM"));
  const [classTypeFilter, setClassTypeFilter] = useState<string>("");
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [selectedBookingIds, setSelectedBookingIds] = useState<Set<string>>(new Set());
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [showPatternSheet, setShowPatternSheet] = useState(false);
  const [showConfirmSheet, setShowConfirmSheet] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const availabilityQuery = useQuery(sessionsQueries.availabilityByMonth(month));
  const allSessions = (availabilityQuery.data?.sessions ?? []) as AvailabilitySession[];

  // Set of sessionIds the bound client already has an active booking on —
  // used to render those cards as disabled "Već rezervisano" and to skip
  // them in pattern expansion (so the count never disagrees with the
  // selectable cards). The server-side `skippedAlreadyBooked` check stays
  // as defence-in-depth for race conditions.
  const clientBookingsQ = useInfiniteQuery({
    ...bookingsQueries.byClient({
      clientUserId: clientUserId ?? "",
      period: "upcoming",
    }),
    enabled: !!clientUserId,
  });
  const alreadyBookedSessionIds = new Set<string>(
    (clientBookingsQ.data?.pages ?? [])
      .flatMap((p) => p.bookings ?? [])
      .filter((b) => b.status === "CONFIRMED")
      .map((b) => b.session.id),
  );

  // Distinct ClassTypes for the filter chips, in observed order so the UI
  // stays stable across refetches.
  const classTypeNames: string[] = [];
  for (const s of allSessions) {
    if (!classTypeNames.includes(s.classTypeName)) classTypeNames.push(s.classTypeName);
  }
  classTypeNames.sort();

  const sessions = classTypeFilter
    ? allSessions.filter((s) => s.classTypeName === classTypeFilter)
    : allSessions;

  const daySessions = sessions
    .filter((s) => dayjs(s.startsAt).format("YYYY-MM-DD") === selectedDate)
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));

  // Activity dots reflect the unfiltered schedule so the admin can see
  // that other class types exist on a day even when filtered out.
  const sessionsByDay = allSessions.reduce<Record<string, number>>((acc, s) => {
    const k = dayjs(s.startsAt).format("YYYY-MM-DD");
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  function toggleSession(s: AvailabilitySession) {
    // Past + full + already-booked sessions are visible (so the schedule
    // looks complete and the admin can see the client's existing slots)
    // but not selectable — SelectableSessionCard renders them disabled so
    // this guard is belt-and-braces.
    if (new Date(s.startsAt).getTime() < nowMs()) return;
    if (s.availableSlots <= 0) return;
    if (alreadyBookedSessionIds.has(s.id)) return;
    setSelectedSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(s.id)) next.delete(s.id);
      else next.add(s.id);
      return next;
    });
  }

  function handlePrevWeek() {
    const newStart = weekStart.subtract(1, "week");
    setWeekStart(newStart);
    const newMonth = newStart.format("YYYY-MM");
    if (newMonth !== month) setMonth(newMonth);
  }
  function handleNextWeek() {
    const newStart = weekStart.add(1, "week");
    setWeekStart(newStart);
    const newMonth = newStart.format("YYYY-MM");
    if (newMonth !== month) setMonth(newMonth);
  }

  function applyPattern(input: PatternInput) {
    const matched = expandPattern(allSessions, input);
    setSelectedSessionIds((prev) => {
      const next = new Set(prev);
      for (const id of matched) {
        // Don't reapply over an existing booking — the server would skip it
        // and the admin would see a misleading "N matched" count.
        if (alreadyBookedSessionIds.has(id)) continue;
        next.add(id);
      }
      return next;
    });
    setShowPatternSheet(false);
  }

  return (
    <ScreenContainerRaw title={t("admin.reservations.title", { defaultValue: "Rezervacije" })}>
      <ClientBanner
        clientFullName={clientFullName}
        onPress={() => setShowClientPicker(true)}
        onClear={() => {
          setClientProfileId(null);
          setClientUserId(null);
          setClientFullName(null);
          setSelectedSessionIds(new Set());
          setSelectedBookingIds(new Set());
        }}
      />
      <ModeToggle
        mode={mode}
        onChange={(m) => {
          setMode(m);
          setSelectedSessionIds(new Set());
          setSelectedBookingIds(new Set());
        }}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: bottomPad + 80 }}
      >
        {mode === "reserve" ? (
          <>
            <View className="pb-3">
              <StudioWeekStrip
                weekStart={weekStart}
                selected={dayjs(selectedDate)}
                onSelect={(d) => {
                  setSelectedDate(d.format("YYYY-MM-DD"));
                  const newMonth = d.format("YYYY-MM");
                  if (newMonth !== month) setMonth(newMonth);
                }}
                sessionsByDay={sessionsByDay}
                onPrevWeek={handlePrevWeek}
                onNextWeek={handleNextWeek}
                rangeLabel={`${weekStart.locale(lang).format("D. MMM")} — ${weekStart
                  .add(6, "day")
                  .locale(lang)
                  .format("D. MMM")}`}
              />
            </View>

            {classTypeNames.length > 1 ? (
              <ClassTypeFilter
                names={classTypeNames}
                value={classTypeFilter}
                onChange={setClassTypeFilter}
              />
            ) : null}

            {/* Day-label + accelerator chip row */}
            <View className="px-5 pt-2 pb-3 flex-row items-baseline justify-between">
              <CapsLabel size={11} tracking={2.4} className="text-muted">
                {dayjs(selectedDate).locale(lang).format("dddd, D MMMM").toUpperCase()}
              </CapsLabel>
              <Pressable
                testID="reservation-open-pattern-sheet"
                onPress={() => setShowPatternSheet(true)}
                disabled={!clientProfileId}
                hitSlop={6}
                style={{ opacity: clientProfileId ? 1 : 0.4 }}
              >
                <View className="flex-row items-center gap-1.5">
                  <Feather name="repeat" size={12} className="text-accent" />
                  <Text
                    className="text-accent font-body-medium"
                    style={{ fontSize: 12, letterSpacing: 0.4 }}
                  >
                    {t("admin.reservations.applyPattern", { defaultValue: "Obrazac" })}
                  </Text>
                </View>
              </Pressable>
            </View>

            <View className="px-5">
              {daySessions.length === 0 ? (
                <EmptyState title={t("client.dayView.noSessions")} />
              ) : (
                <View className="flex-col gap-3">
                  {daySessions.map((s) => (
                    <SelectableSessionCard
                      key={s.id}
                      session={s}
                      selected={selectedSessionIds.has(s.id)}
                      alreadyBooked={alreadyBookedSessionIds.has(s.id)}
                      onPress={() => toggleSession(s)}
                    />
                  ))}
                </View>
              )}
            </View>
          </>
        ) : (
          <CancelList
            clientUserId={clientUserId}
            selectedBookingIds={selectedBookingIds}
            onToggle={(bookingId) =>
              setSelectedBookingIds((prev) => {
                const next = new Set(prev);
                if (next.has(bookingId)) next.delete(bookingId);
                else next.add(bookingId);
                return next;
              })
            }
          />
        )}
      </ScrollView>

      {mode === "reserve" ? (
        <SelectionToolbar
          count={selectedSessionIds.size}
          disabled={!clientProfileId || selectedSessionIds.size === 0}
          onConfirm={() => setShowConfirmSheet(true)}
          onClear={() => setSelectedSessionIds(new Set())}
          ctaLabel={t("admin.reservations.confirm", { defaultValue: "Rezerviši" })}
        />
      ) : (
        <SelectionToolbar
          count={selectedBookingIds.size}
          disabled={!clientProfileId || selectedBookingIds.size === 0}
          onConfirm={() => setShowCancelConfirm(true)}
          onClear={() => setSelectedBookingIds(new Set())}
          ctaLabel={t("admin.reservations.cancelCta", { defaultValue: "Otkaži" })}
          ctaDanger
        />
      )}

      <AppSheet open={showClientPicker} onOpenChange={setShowClientPicker} rawContent>
        <ClientPickerSheet
          onPick={(profile) => {
            setClientProfileId(profile.id);
            setClientUserId(profile.userId);
            setClientFullName(profile.fullName);
            setShowClientPicker(false);
          }}
        />
      </AppSheet>

      <AppSheet open={showPatternSheet} onOpenChange={setShowPatternSheet}>
        <PatternSheet onApply={applyPattern} />
      </AppSheet>

      <AppSheet open={showConfirmSheet} onOpenChange={setShowConfirmSheet}>
        {clientProfileId ? (
          <ConfirmSheet
            clientProfileId={clientProfileId}
            selectedSessions={allSessions.filter((s) => selectedSessionIds.has(s.id))}
            onDone={() => {
              setSelectedSessionIds(new Set());
              setShowConfirmSheet(false);
            }}
            onCancel={() => setShowConfirmSheet(false)}
          />
        ) : null}
      </AppSheet>

      <AppSheet open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <CancelConfirmSheet
          bookingIds={[...selectedBookingIds]}
          onDone={() => {
            setSelectedBookingIds(new Set());
            setShowCancelConfirm(false);
          }}
          onCancel={() => setShowCancelConfirm(false)}
        />
      </AppSheet>
    </ScreenContainerRaw>
  );
}

function ClientBanner({
  clientFullName,
  onPress,
  onClear,
}: {
  clientFullName: string | null;
  onPress: () => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="px-5 pt-3 pb-2">
      <Pressable
        onPress={onPress}
        className="flex-row items-center gap-3 rounded-2xl border border-glass-border bg-glass-surface px-4 py-3"
      >
        {clientFullName ? (
          <InitialsAvatar name={clientFullName} size={32} />
        ) : (
          <View
            className="items-center justify-center rounded-full bg-glass-surface border border-glass-border"
            style={{ width: 32, height: 32 }}
          >
            <Feather name="user" size={14} />
          </View>
        )}
        <View className="flex-1">
          <CapsLabel size={9} tracking={1.6} className="text-muted">
            {t("admin.reservations.reservingFor", { defaultValue: "Rezerviše za" })}
          </CapsLabel>
          <Text
            className="text-foreground font-body-semibold"
            style={{ fontSize: 16, letterSpacing: -0.2 }}
            numberOfLines={1}
          >
            {clientFullName ??
              t("admin.reservations.pickClient", { defaultValue: "Izaberi klijenta" })}
          </Text>
        </View>
        {clientFullName ? (
          <Pressable onPress={onClear} hitSlop={8}>
            <Feather name="x" size={18} />
          </Pressable>
        ) : (
          <Feather name="chevron-right" size={18} />
        )}
      </Pressable>
    </View>
  );
}

function InitialsAvatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return (
    <View
      className="items-center justify-center rounded-full bg-accent-soft"
      style={{ width: size, height: size }}
    >
      <Text
        className="text-accent font-body-bold"
        style={{ fontSize: Math.round(size * 0.36) }}
      >
        {initials}
      </Text>
    </View>
  );
}

function ClassTypeFilter({
  names,
  value,
  onChange,
}: {
  names: string[];
  value: string;
  onChange: (next: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="pb-3">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
      >
        <FilterChip
          active={value === ""}
          label={t("admin.reservations.classFilterAll", { defaultValue: "Svi" })}
          onPress={() => onChange("")}
        />
        {names.map((n) => (
          <FilterChip key={n} active={value === n} label={n} onPress={() => onChange(n)} />
        ))}
      </ScrollView>
    </View>
  );
}

function SelectableSessionCard({
  session,
  selected,
  alreadyBooked,
  onPress,
}: {
  session: AvailabilitySession;
  selected: boolean;
  alreadyBooked: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const isFull = session.availableSlots <= 0;
  // Past sessions are visible but disabled — booking a past session has no
  // real meaning. Full sessions: the "0/6" badge already explains why.
  // Already-booked: the client owns an active booking on this session, so
  // re-reserving would just hit the server's skippedAlreadyBooked path.
  const isPast = new Date(session.startsAt).getTime() < nowMs();
  const disabled = isPast || isFull || alreadyBooked;
  return (
    <Pressable
      testID={`reservation-session-${session.id}`}
      onPress={onPress}
      disabled={disabled}
      style={disabled ? { opacity: 0.45 } : undefined}
    >
      <View pointerEvents="none">
        <SessionCard
          time={`${dayjs(session.startsAt).format("HH:mm")} - ${dayjs(session.endsAt).format("HH:mm")}`}
          className={session.classTypeName}
          trainerName={session.trainerName ?? undefined}
          room={session.roomName ?? undefined}
          bookedCount={session.bookedCount}
          capacity={session.capacity}
          status={isFull ? "full" : "available"}
        />
      </View>
      {selected ? (
        <View
          pointerEvents="none"
          className="absolute inset-0 border-2 border-accent"
          style={{ borderRadius: CARD_RADIUS }}
        />
      ) : null}
      {alreadyBooked ? (
        <View
          pointerEvents="none"
          className="absolute"
          style={{ top: 10, right: 12 }}
        >
          <Badge status="success">
            {t("admin.reservations.alreadyBooked", { defaultValue: "Već rezervisano" })}
          </Badge>
        </View>
      ) : null}
    </Pressable>
  );
}

function SelectionToolbar({
  count,
  disabled,
  onConfirm,
  onClear,
  ctaLabel,
  ctaDanger,
}: {
  count: number;
  disabled: boolean;
  onConfirm: () => void;
  onClear: () => void;
  ctaLabel: string;
  ctaDanger?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View
      className="absolute bottom-0 left-0 right-0 flex-row items-center gap-3 border-t border-glass-border bg-bg/95 px-5 py-4"
      style={{ paddingBottom: 24 }}
    >
      <View className="flex-1">
        <CapsLabel size={9} tracking={1.6} className="text-muted">
          {t("admin.reservations.selected", { defaultValue: "Izabrano" })}
        </CapsLabel>
        <Text
          className="text-foreground font-body-bold"
          style={{ fontSize: 22, lineHeight: 24 }}
        >
          {count}
        </Text>
      </View>
      {count > 0 ? (
        <Pressable onPress={onClear} hitSlop={8}>
          <Text className="text-muted font-body-medium">
            {t("admin.reservations.clear", { defaultValue: "Poništi" })}
          </Text>
        </Pressable>
      ) : null}
      <Button
        testID="reservation-toolbar-cta"
        onPress={onConfirm}
        disabled={disabled}
        variant={ctaDanger ? "danger" : "primary"}
      >
        {ctaLabel}
      </Button>
    </View>
  );
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: "reserve" | "cancel";
  onChange: (m: "reserve" | "cancel") => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="px-5 pb-2">
      <SegmentedControl<"reserve" | "cancel">
        value={mode}
        segments={[
          {
            value: "reserve",
            label: t("admin.reservations.modeReserve", { defaultValue: "Rezerviši" }),
            testID: "reservation-mode-reserve",
          },
          {
            value: "cancel",
            label: t("admin.reservations.modeCancel", { defaultValue: "Otkaži" }),
            testID: "reservation-mode-cancel",
          },
        ]}
        onValueChange={onChange}
      />
    </View>
  );
}

function CancelList({
  clientUserId,
  selectedBookingIds,
  onToggle,
}: {
  clientUserId: string | null;
  selectedBookingIds: Set<string>;
  onToggle: (bookingId: string) => void;
}) {
  const { t } = useTranslation();
  const bookingsQ = useInfiniteQuery({
    ...bookingsQueries.byClient({
      clientUserId: clientUserId ?? "",
      period: "upcoming",
    }),
    enabled: !!clientUserId,
  });

  if (!clientUserId) {
    return (
      <View className="px-5 pt-6">
        <EmptyState
          title={t("admin.reservations.cancel.pickClientFirst", {
            defaultValue: "Izaberi klijenta da bi prikazao rezervacije",
          })}
        />
      </View>
    );
  }
  const rows = (bookingsQ.data?.pages ?? [])
    .flatMap((p) => p.bookings ?? [])
    .filter((b) => b.status === "CONFIRMED");

  if (rows.length === 0) {
    return (
      <View className="px-5 pt-6">
        <EmptyState
          title={t("admin.reservations.cancel.empty", {
            defaultValue: "Nema budućih rezervacija",
          })}
        />
      </View>
    );
  }

  return (
    <View className="px-5 flex-col gap-3 pt-2">
      {rows.map((b) => {
        const selected = selectedBookingIds.has(b.id);
        return (
          <Pressable
            key={b.id}
            testID={`cancel-booking-${b.id}`}
            onPress={() => onToggle(b.id)}
          >
            <View
              className={
                selected
                  ? "rounded-2xl border-2 border-danger p-3"
                  : "rounded-2xl border border-glass-border p-3"
              }
            >
              <Text className="text-foreground font-body-semibold">
                {b.session.classType.name}
              </Text>
              <Text className="text-muted text-xs">
                {dayjs(b.session.startsAt).format("ddd D MMM • HH:mm")}
                {b.session.trainer ? ` • ${b.session.trainer.fullName}` : null}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function ClientPickerSheet({
  onPick,
}: {
  onPick: (input: { id: string; fullName: string; userId: string }) => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const clientsQ = useInfiniteQuery(clientsQueries.list({ q }));
  const rows = (clientsQ.data?.pages ?? []).flatMap((p) => p.clients ?? []);

  // rawContent mode — we own padding. Search bar is sticky at the top via
  // ListHeaderComponent; the FlatList scrolls inside the sheet's own gesture
  // context (no nested ScrollView that competes with pan-down-to-close).
  return (
    <BottomSheetFlatList
      data={rows}
      keyExtractor={(c) => c.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        paddingHorizontal: 24,
        paddingTop: 8,
        paddingBottom: 40,
      }}
      ListHeaderComponent={
        <View className="pb-3">
          <Input
            placeholder={t("admin.clients.searchPlaceholder", { defaultValue: "Pretraga..." })}
            value={q}
            onChangeText={setQ}
          />
        </View>
      }
      ItemSeparatorComponent={() => (
        <View style={{ height: 1, backgroundColor: "rgba(0,0,0,0.06)" }} />
      )}
      renderItem={({ item: c }) => (
        <Pressable
          onPress={() =>
            onPick({
              id: c.id,
              fullName: c.user.fullName,
              userId: c.user.id,
            })
          }
          className="flex-row items-center gap-3 py-3"
        >
          <InitialsAvatar name={c.user.fullName} size={36} />
          <View className="flex-1">
            <Text className="text-foreground font-body-medium" numberOfLines={1}>
              {c.user.fullName}
            </Text>
            <Text className="text-muted text-xs" numberOfLines={1}>
              {c.user.email}
            </Text>
          </View>
        </Pressable>
      )}
    />
  );
}

// ============================================================================
// Pattern sheet — weekly + biweekly rhythms
// ============================================================================

function PatternSheet({
  onApply,
}: {
  onApply: (input: PatternInput) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "sr";
  const labels = lang === "en" ? WEEKDAY_LABELS_EN : WEEKDAY_LABELS_SR;
  const [rhythm, setRhythm] = useState<"weekly" | "biweekly">("weekly");
  const [weekA, setWeekA] = useState<RhythmWeek>({ weekdays: [], timeOfDayMins: 7 * 60 });
  const [weekB, setWeekB] = useState<RhythmWeek>({ weekdays: [], timeOfDayMins: 17 * 60 });
  // Raw string state for the weeks input — only parsed on apply, so deleting
  // the value doesn't snap to "0" while the user is editing.
  const [weeksStr, setWeeksStr] = useState("12");

  function handleApply() {
    if (weekA.weekdays.length === 0) return;
    if (rhythm === "biweekly" && weekB.weekdays.length === 0) return;
    const parsed = Number(weeksStr);
    const weekCount = Number.isFinite(parsed) && parsed > 0 ? Math.min(52, parsed) : 1;
    onApply({
      rhythm,
      weekA,
      weekB,
      weeks: weekCount,
      rangeStart: dayjs().startOf("day"),
    });
  }

  const aReady = weekA.weekdays.length > 0;
  const bReady = rhythm === "weekly" || weekB.weekdays.length > 0;
  const canApply = aReady && bReady;

  return (
    <View className="flex-col gap-5">
      {/* Rhythm toggle — reuse the studio FilterChip aesthetic */}
      <View className="flex-row gap-2">
        <FilterChip
          label={t("admin.reservations.pattern.weekly", { defaultValue: "Svake nedelje" })}
          active={rhythm === "weekly"}
          onPress={() => setRhythm("weekly")}
        />
        <FilterChip
          label={t("admin.reservations.pattern.biweekly", { defaultValue: "Naizmenično" })}
          active={rhythm === "biweekly"}
          onPress={() => setRhythm("biweekly")}
        />
      </View>

      {rhythm === "weekly" ? (
        <WeekEditor
          labels={labels}
          value={weekA}
          onChange={setWeekA}
          weekLabel={null}
        />
      ) : (
        <View className="flex-col gap-5">
          <WeekEditor
            labels={labels}
            value={weekA}
            onChange={setWeekA}
            weekLabel={t("admin.reservations.pattern.weekA", { defaultValue: "Nedelja A" })}
          />
          <View style={{ height: 1, backgroundColor: "rgba(0,0,0,0.08)" }} />
          <WeekEditor
            labels={labels}
            value={weekB}
            onChange={setWeekB}
            weekLabel={t("admin.reservations.pattern.weekB", { defaultValue: "Nedelja B" })}
          />
        </View>
      )}

      <View className="gap-1.5">
        <CapsLabel size={9} tracking={1.6} className="text-muted">
          {t("admin.reservations.pattern.weeks", { defaultValue: "Broj nedelja" })}
        </CapsLabel>
        <Input
          value={weeksStr}
          onChangeText={setWeeksStr}
          keyboardType="numeric"
          maxLength={2}
        />
      </View>

      <Button onPress={handleApply} disabled={!canApply}>
        {t("admin.reservations.pattern.apply", { defaultValue: "Primeni" })}
      </Button>
    </View>
  );
}

function WeekEditor({
  labels,
  value,
  onChange,
  weekLabel,
}: {
  labels: string[];
  value: RhythmWeek;
  onChange: (next: RhythmWeek) => void;
  weekLabel: string | null;
}) {
  const { t } = useTranslation();
  const [hourStr, setHourStr] = useState(
    String(Math.floor(value.timeOfDayMins / 60)).padStart(2, "0"),
  );
  const [minStr, setMinStr] = useState(
    String(value.timeOfDayMins % 60).padStart(2, "0"),
  );

  // Commit hour/minute back to the parent only on blur (or when the field
  // holds a parseable number). While the user is editing — including the
  // intermediate "" state during a delete — we keep the raw string and
  // don't overwrite it with a parsed value.
  function commitTime(nextHourStr: string, nextMinStr: string) {
    const h = nextHourStr === "" ? Math.floor(value.timeOfDayMins / 60) : Math.max(0, Math.min(23, Number(nextHourStr) || 0));
    const m = nextMinStr === "" ? value.timeOfDayMins % 60 : Math.max(0, Math.min(59, Number(nextMinStr) || 0));
    const next = h * 60 + m;
    if (next !== value.timeOfDayMins) {
      onChange({ ...value, timeOfDayMins: next });
    }
  }

  function toggleDay(d: number) {
    const next = value.weekdays.includes(d)
      ? value.weekdays.filter((x) => x !== d)
      : [...value.weekdays, d].sort((a, b) => a - b);
    onChange({ ...value, weekdays: next });
  }

  return (
    <View className="flex-col gap-4">
      {weekLabel ? (
        <CapsLabel size={9} tracking={1.6} className="text-muted">
          {weekLabel}
        </CapsLabel>
      ) : null}

      {/* Weekday glyphs — square cells, foreground-fill on selected */}
      <View className="flex-row gap-1.5">
        {labels.map((l, i) => {
          const active = value.weekdays.includes(i);
          return (
            <Pressable
              key={i}
              onPress={() => toggleDay(i)}
              className={
                active
                  ? "flex-1 items-center justify-center bg-foreground"
                  : "flex-1 items-center justify-center border border-glass-border bg-glass-surface"
              }
              style={{ height: 44, borderRadius: 12 }}
            >
              <Text
                className={
                  active
                    ? "text-background font-body-semibold"
                    : "text-foreground font-body-medium"
                }
                style={{ fontSize: 13 }}
              >
                {l}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Time — two Input fields in a row with a hairline colon between them.
          Raw-string state so deleting a digit doesn't snap the field back
          to "0". Inputs commit a parsed value as the user types, then pad
          on blur. */}
      <View className="gap-1.5">
        <CapsLabel size={9} tracking={1.6} className="text-muted">
          {t("admin.reservations.pattern.time", { defaultValue: "Vreme" })}
        </CapsLabel>
        <View className="flex-row items-center gap-2">
          <View style={{ width: 72 }}>
            <Input
              value={hourStr}
              onChangeText={(v) => {
                setHourStr(v);
                commitTime(v, minStr);
              }}
              onBlur={() => {
                const padded =
                  hourStr === ""
                    ? "00"
                    : String(Number(hourStr) || 0).padStart(2, "0");
                setHourStr(padded);
              }}
              keyboardType="numeric"
              maxLength={2}
              textAlign="center"
            />
          </View>
          <Text
            className="text-muted font-body-medium"
            style={{ fontSize: 22, lineHeight: 26 }}
          >
            :
          </Text>
          <View style={{ width: 72 }}>
            <Input
              value={minStr}
              onChangeText={(v) => {
                setMinStr(v);
                commitTime(hourStr, v);
              }}
              onBlur={() => {
                const padded =
                  minStr === ""
                    ? "00"
                    : String(Number(minStr) || 0).padStart(2, "0");
                setMinStr(padded);
              }}
              keyboardType="numeric"
              maxLength={2}
              textAlign="center"
            />
          </View>
        </View>
      </View>
    </View>
  );
}

// ============================================================================
// Confirm sheets — inline rows, no nested cards
// ============================================================================

function ConfirmSheet({
  clientProfileId,
  selectedSessions,
  onDone,
  onCancel,
}: {
  clientProfileId: string;
  selectedSessions: AvailabilitySession[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const create = useCreateReservationsMutation();
  const packagesQ = useQuery(packagesQueries.clientPackages(clientProfileId));
  const pkgs = packagesQ.data?.packages ?? [];
  const nowMs = Date.now();
  const hasAnyActivePackage = pkgs.some(
    (p) => new Date(p.expiresAt).getTime() > nowMs && p.sessionsRemaining > 0,
  );

  const byClassTypeMap = new Map<string, number>();
  for (const s of selectedSessions)
    byClassTypeMap.set(s.classTypeName, (byClassTypeMap.get(s.classTypeName) ?? 0) + 1);
  const byClassType = [...byClassTypeMap.entries()];

  const showNoPackageWarning = !packagesQ.isLoading && !hasAnyActivePackage;

  return (
    <View className="flex-col">
      {/* Header — count as a Fraunces numeral, label as a hint */}
      <View className="pb-4">
        <Text
          className="text-foreground font-display"
          style={{ fontSize: 36, lineHeight: 40, letterSpacing: -0.8 }}
        >
          {selectedSessions.length}
        </Text>
        <CapsLabel size={10} tracking={1.6} className="text-muted">
          {t("admin.reservations.confirmCountLabel", { defaultValue: "Termina za rezervaciju" })}
        </CapsLabel>
      </View>

      {/* Per-class-type rows */}
      <View style={{ borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.08)" }}>
        {byClassType.map(([name, count]) => (
          <Row key={name} label={name} value={String(count)} />
        ))}
      </View>

      {showNoPackageWarning ? (
        <View
          className="pt-3 pb-3"
          style={{ borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.08)" }}
        >
          <CapsLabel size={9} tracking={1.6} className="text-muted">
            {t("admin.reservations.noPackageWarningLabel", { defaultValue: "Napomena" })}
          </CapsLabel>
          <Text
            className="text-foreground"
            style={{ fontSize: 14, lineHeight: 20, paddingTop: 4 }}
          >
            {t("admin.reservations.noPackageWarningBody", {
              defaultValue:
                "Klijent nema aktivan paket. Rezervacije će ostati, ali se neće skidati iz paketa dok klijent ne kupi.",
            })}
          </Text>
        </View>
      ) : null}

      <View className="flex-row gap-3 pt-5">
        <Button variant="secondary" className="flex-1" onPress={onCancel}>
          {t("admin.clients.cancel", { defaultValue: "Otkaži" })}
        </Button>
        <Button
          testID="reservation-confirm-sheet-cta"
          className="flex-1"
          disabled={create.isPending}
          onPress={() => {
            create.mutate(
              {
                clientProfileId,
                sessionIds: selectedSessions.map((s) => s.id),
              },
              { onSuccess: onDone },
            );
          }}
        >
          {t("admin.reservations.confirm", { defaultValue: "Rezerviši" })}
        </Button>
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View
      className="flex-row items-baseline justify-between py-3"
      style={{ borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.08)" }}
    >
      <Text className="text-foreground" style={{ fontSize: 14, letterSpacing: -0.1 }}>
        {label}
      </Text>
      <Text
        className="text-foreground font-display"
        style={{ fontSize: 16, lineHeight: 18 }}
      >
        {value}
      </Text>
    </View>
  );
}

function CancelConfirmSheet({
  bookingIds,
  onDone,
  onCancel,
}: {
  bookingIds: string[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const cancelMut = useCancelReservationsBulkMutation();
  return (
    <View className="flex-col">
      <View className="pb-4">
        <Text
          className="text-foreground font-display"
          style={{ fontSize: 36, lineHeight: 40, letterSpacing: -0.8 }}
        >
          {bookingIds.length}
        </Text>
        <CapsLabel size={10} tracking={1.6} className="text-muted">
          {t("admin.reservations.cancelCountLabel", {
            defaultValue: "Termina za otkazivanje",
          })}
        </CapsLabel>
      </View>

      <View
        className="pt-3 pb-3"
        style={{ borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.08)" }}
      >
        <CapsLabel size={9} tracking={1.6} className="text-muted">
          {t("admin.reservations.cancelNoteLabel", { defaultValue: "Napomena" })}
        </CapsLabel>
        <Text
          className="text-foreground"
          style={{ fontSize: 14, lineHeight: 20, paddingTop: 4 }}
        >
          {t("admin.reservations.cancelConfirmBody", {
            defaultValue:
              "Otkazivanja u poslednjim satima pre termina (zavisi od paketa) skinuće jednu sesiju kao kaznu.",
          })}
        </Text>
      </View>

      <View className="flex-row gap-3 pt-5">
        <Button variant="secondary" className="flex-1" onPress={onCancel}>
          {t("admin.clients.cancel", { defaultValue: "Otkaži" })}
        </Button>
        <Button
          testID="reservation-cancel-confirm-sheet-cta"
          variant="danger"
          className="flex-1"
          disabled={cancelMut.isPending}
          onPress={() => {
            cancelMut.mutate({ bookingIds }, { onSuccess: onDone });
          }}
        >
          {t("admin.reservations.cancelConfirmCta", { defaultValue: "Potvrdi" })}
        </Button>
      </View>
    </View>
  );
}
