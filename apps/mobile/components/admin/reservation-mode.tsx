/**
 * Reservation mode — admin-only screen bound to one Client. Two ways to
 * populate the selection: tap session cards in the calendar, or apply
 * a weekly/biweekly pattern via the accelerator sheet. Both feed the same
 * `selectedSessionsById` map.
 *
 * The selection state machine (mode, the two selection sets, the ClassType
 * filter, the unselectable rules, pattern merging) is pure and lives in
 * `lib/admin/reservation-selection.ts` with unit tests — this component
 * holds the state value and keeps queries, sheets, mutations and rendering.
 *
 * The route is gated to ADMIN — trainers and clients hitting
 * /klijenti/rezervisi get redirected to their home tab.
 */
import React, { useState, useEffect, useRef } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useQuery, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import dayjs from "dayjs";
import { Icon } from "@/components/ui/icon";
import { AppSheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SwitchRow } from "@/components/ui/switch-row";
import { CapsLabel } from "@/components/ui/studio/typography";
import { SessionCard } from "@/components/ui/session-card";
import { StudioWeekStrip } from "@/components/ui/studio";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { EmptyState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { FilterChip } from "@/components/ui/studio/filter-chip";
import { now, nowMs } from "@/lib/now";
import { useWeekNavigation, weekRangeLabel } from "@/lib/use-week-navigation";
import { useThemePreference } from "@/lib/theme-preference";
import { authQueries } from "@/lib/queries/auth-queries-factory";
import {
  monthKeysForPattern,
  type PatternInput,
  type RhythmWeek,
} from "@/lib/reservation-pattern";
import {
  applyPattern,
  classifySession,
  clearActiveSelection,
  createInitialState,
  distinctClassTypeNames,
  resetSelections,
  selectedSessionList,
  setClassTypeFilter,
  switchMode,
  toggleBooking,
  toggleSession,
  type SelectionContext,
  type SessionClassification,
} from "@/lib/admin/reservation-selection";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";
import { packagesQueries } from "@/lib/queries/packages-queries-factory";
import {
  bookingsQueries,
  fetchAllUpcomingBookedSessionIds,
} from "@/lib/queries/bookings-queries-factory";
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
  // The "Obrazac" affordance keeps the green accent on light, but the dark
  // accent green nearly vanishes on the dark canvas — go white there.
  const { resolvedTheme } = useThemePreference();
  const obrazacColor = resolvedTheme === "dark" ? "#FFFFFF" : "#2e5b42";

  // Role gate — trainers and clients land here only by typing the URL.
  const meQ = useQuery(authQueries.me());
  useEffect(() => {
    const role = meQ.data?.user?.role;
    if (!role) return;
    if (role === "TRAINER") router.replace("/(trainer)/raspored" as Href);
    else if (role === "CLIENT") router.replace("/(client)" as Href);
  }, [meQ.data, router]);

  // The whole selection state machine lives in the pure module
  // `lib/admin/reservation-selection` — the component just holds the value
  // and dispatches transitions, so the rules are unit-testable.
  const [selection, setSelection] = useState(
    createInitialState<AvailabilitySession>,
  );
  const { mode, classTypeFilter, selectedSessionsById, selectedBookingIds } = selection;
  // Everything selected, in every month — the visible month's array is only
  // ever a subset (see reservation-selection.ts → selectedSessionsById).
  const selectedSessions = selectedSessionList(selection);
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

  const nav = useWeekNavigation();
  const { selectedDate, weekStart, month } = nav;
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [showPatternSheet, setShowPatternSheet] = useState(false);
  // Transient line under the "Obrazac" row: when a pattern sweep skips full
  // sessions, tell the admin how many were dropped (tap silently refuses
  // full sessions, so the pattern tool surfacing the count avoids a silent
  // "I selected fewer than the pattern said" surprise). Cleared when the
  // pattern sheet reopens or another pattern is applied.
  const [patternNotice, setPatternNotice] = useState<string | null>(null);
  const [showConfirmSheet, setShowConfirmSheet] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const queryClient = useQueryClient();
  // Invalidation ticket for an in-flight pattern apply. The sweep awaits one
  // network round-trip per month; if the admin dismisses the pattern sheet or
  // the bound client changes before the fetches land, the computed result
  // describes a selection context that no longer exists and must be dropped —
  // otherwise it would resurrect a cleared selection or leak one client's
  // pattern onto the next. Bumped by every event that ends that context.
  const applyEpochRef = useRef(0);
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
  const activeBookings = (clientBookingsQ.data?.pages ?? [])
    .flatMap((p) => p.bookings ?? [])
    .filter((b) => b.status === "CONFIRMED");
  const alreadyBookedSessionIds = new Set<string>(
    activeBookings.map((b) => b.session.id),
  );
  const selectionCtx: SelectionContext = {
    nowMs: nowMs(),
    alreadyBookedSessionIds,
  };
  // The cancel-mode week strip marks the bound client's OWN booked days —
  // admins navigate weeks by "where does this client have stuff", not "how
  // busy is the studio". This rides `bookedByDay` (the booking-state prop)
  // rather than passing bookings in as `sessionsByDay`, so the strip's two
  // indicators keep their real meanings.
  const bookedByDay = activeBookings.reduce<Record<string, boolean>>((acc, b) => {
    acc[dayjs(b.session.startsAt).format("YYYY-MM-DD")] = true;
    return acc;
  }, {});
  // Bookings filtered by the active ClassType chip and grouped by date.
  const filteredBookings = classTypeFilter
    ? activeBookings.filter((b) => b.session.classType.name === classTypeFilter)
    : activeBookings;
  const dayBookings = filteredBookings
    .filter(
      (b) => dayjs(b.session.startsAt).format("YYYY-MM-DD") === selectedDate,
    )
    .sort(
      (a, b) => +new Date(a.session.startsAt) - +new Date(b.session.startsAt),
    );
  // ClassType names visible to the cancel-mode filter: distinct values
  // observed on this client's bookings (no point showing a chip for a
  // class type the client has zero bookings in).
  const bookingClassTypeNames = distinctClassTypeNames(
    activeBookings.map((b) => b.session.classType.name),
  );

  // Distinct ClassTypes for the reserve-mode filter chips.
  const classTypeNames = distinctClassTypeNames(
    allSessions.map((s) => s.classTypeName),
  );

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

  // A 12-week pattern almost always outruns the month the calendar is parked
  // on — started on the 28th it would otherwise have nothing but that month's
  // last few sessions to match ("2 selected instead of 15"). Fetch every month
  // the range spans (cached at the factory's own staleTime — these are the same
  // query options the calendar uses, so a revisit is free) and expand against
  // the merged list.
  async function handleApplyPattern(input: PatternInput) {
    const epoch = applyEpochRef.current;
    const months = monthKeysForPattern(input);
    // The screen's own bookings query only holds its loaded pages (page one,
    // usually) — enough for the visible list, not for a sweep that spans
    // months. Walk the complete set here; if that walk fails, fall back to
    // the loaded pages rather than blocking the sweep (the server re-checks
    // and skips already-booked sessions anyway — only the count softens).
    const [pages, completeBookedIds] = await Promise.all([
      Promise.all(
        months.map((m) =>
          queryClient.fetchQuery(sessionsQueries.availabilityByMonth(m)),
        ),
      ),
      clientUserId
        ? fetchAllUpcomingBookedSessionIds(clientUserId).catch(() => null)
        : Promise.resolve(null),
    ]);
    // The month endpoints can overlap at boundaries — dedupe by id.
    const byId = new Map<string, AvailabilitySession>();
    for (const page of pages)
      for (const s of page.sessions as AvailabilitySession[]) byId.set(s.id, s);

    // Superseded while we were fetching (sheet dismissed, client changed) —
    // the captured selection no longer describes reality; drop the result.
    if (applyEpochRef.current !== epoch) return;

    const sweepCtx: SelectionContext = {
      nowMs: nowMs(),
      alreadyBookedSessionIds: completeBookedIds ?? alreadyBookedSessionIds,
    };
    const result = applyPattern(selection, [...byId.values()], input, sweepCtx);
    setSelection(result.state);
    const total = result.added + result.skippedFull + result.skippedAlreadyBooked;
    setPatternNotice(
      result.skippedFull > 0
        ? t("admin.reservations.patternSkippedFull", {
            skipped: result.skippedFull,
            total,
            defaultValue: "{{skipped}} of {{total}} sessions were full and skipped",
          })
        : null,
    );
    setShowPatternSheet(false);
  }

  return (
    <ScreenContainerRaw title={t("admin.reservations.title", { defaultValue: "Rezervacije" })}>
      <ClientBanner
        clientFullName={clientFullName}
        onPress={() => setShowClientPicker(true)}
        onClear={() => {
          // Clear the route params too — otherwise the param-sync effect
          // below sees the still-present ?clientProfileId in the URL and
          // immediately restores the client, making the clear look dead.
          router.setParams({
            clientProfileId: undefined,
            clientUserId: undefined,
            clientFullName: undefined,
          });
          applyEpochRef.current += 1;
          setClientProfileId(null);
          setClientUserId(null);
          setClientFullName(null);
          setSelection(resetSelections);
        }}
      />
      <ModeToggle
        mode={mode}
        onChange={(m) => setSelection((prev) => switchMode(prev, m))}
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
                onSelect={nav.selectDay}
                sessionsByDay={sessionsByDay}
                onPrevWeek={nav.goToPreviousWeek}
                onNextWeek={nav.goToNextWeek}
                rangeLabel={weekRangeLabel(weekStart, lang)}
              />
            </View>

            {classTypeNames.length > 1 ? (
              <ClassTypeFilter
                names={classTypeNames}
                value={classTypeFilter}
                onChange={(next) => setSelection((prev) => setClassTypeFilter(prev, next))}
              />
            ) : null}

            {/* Day-label + accelerator chip row */}
            <View className="px-5 pt-2 pb-3 flex-row items-center justify-between">
              <CapsLabel size={11} tracking={2.4} className="text-muted">
                {dayjs(selectedDate).locale(lang).format("dddd, D MMMM").toUpperCase()}
              </CapsLabel>
              <Pressable
                testID="reservation-open-pattern-sheet"
                onPress={() => {
                  setPatternNotice(null);
                  setShowPatternSheet(true);
                }}
                disabled={!clientProfileId}
                hitSlop={6}
                style={{ opacity: clientProfileId ? 1 : 0.4 }}
              >
                <View className="flex-row items-center gap-1.5">
                  <Icon name="repeat" size={12} color={obrazacColor} />
                  <Text
                    className="font-body-medium"
                    style={{ fontSize: 12, letterSpacing: 0.4, color: obrazacColor }}
                  >
                    {t("admin.reservations.applyPattern", { defaultValue: "Obrazac" })}
                  </Text>
                </View>
              </Pressable>
            </View>

            {patternNotice ? (
              <View className="px-5 pb-3">
                <View className="rounded-2xl border border-glass-border bg-glass-surface px-4 py-2.5">
                  <Text
                    testID="reservation-pattern-skipped-notice"
                    className="text-muted font-body-medium"
                    style={{ fontSize: 13, lineHeight: 18 }}
                  >
                    {patternNotice}
                  </Text>
                </View>
              </View>
            ) : null}

            <View className="px-5">
              {daySessions.length === 0 ? (
                <EmptyState title={t("client.dayView.noSessions")} />
              ) : (
                <View className="flex-col gap-3">
                  {daySessions.map((s) => (
                    <SelectableSessionCard
                      key={s.id}
                      session={s}
                      selected={selectedSessionsById.has(s.id)}
                      classification={classifySession(s, selectionCtx)}
                      onPress={() =>
                        setSelection((prev) => toggleSession(prev, s, selectionCtx))
                      }
                    />
                  ))}
                </View>
              )}
            </View>
          </>
        ) : (
          <>
            <View className="pb-3">
              <StudioWeekStrip
                weekStart={weekStart}
                selected={dayjs(selectedDate)}
                onSelect={nav.selectDay}
                sessionsByDay={{}}
                bookedByDay={bookedByDay}
                onPrevWeek={nav.goToPreviousWeek}
                onNextWeek={nav.goToNextWeek}
                rangeLabel={weekRangeLabel(weekStart, lang)}
              />
            </View>

            {bookingClassTypeNames.length > 1 ? (
              <ClassTypeFilter
                names={bookingClassTypeNames}
                value={classTypeFilter}
                onChange={(next) => setSelection((prev) => setClassTypeFilter(prev, next))}
              />
            ) : null}

            <View className="px-5 pt-2 pb-3">
              <CapsLabel size={11} tracking={2.4} className="text-muted">
                {dayjs(selectedDate).locale(lang).format("dddd, D MMMM").toUpperCase()}
              </CapsLabel>
            </View>

            <View className="px-5">
              {!clientProfileId ? (
                <EmptyState
                  title={t("admin.reservations.cancel.pickClientFirst", {
                    defaultValue: "Izaberi klijenta da bi prikazao rezervacije",
                  })}
                />
              ) : dayBookings.length === 0 ? (
                <EmptyState
                  title={t("admin.reservations.cancel.noBookingsForDay", {
                    defaultValue: "Nema rezervacija ovog dana",
                  })}
                />
              ) : (
                <View className="flex-col gap-3">
                  {dayBookings.map((b) => (
                    <CancellableBookingCard
                      key={b.id}
                      booking={b}
                      selected={selectedBookingIds.has(b.id)}
                      onPress={() => setSelection((prev) => toggleBooking(prev, b.id))}
                    />
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {mode === "reserve" ? (
        <SelectionToolbar
          count={selectedSessions.length}
          disabled={!clientProfileId || selectedSessions.length === 0}
          onConfirm={() => setShowConfirmSheet(true)}
          onClear={() => setSelection(clearActiveSelection)}
          ctaLabel={t("admin.reservations.confirm", { defaultValue: "Rezerviši" })}
        />
      ) : (
        <SelectionToolbar
          count={selectedBookingIds.size}
          disabled={!clientProfileId || selectedBookingIds.size === 0}
          onConfirm={() => setShowCancelConfirm(true)}
          onClear={() => setSelection(clearActiveSelection)}
          ctaLabel={t("admin.reservations.cancelCta", { defaultValue: "Otkaži" })}
          ctaDanger
        />
      )}

      <AppSheet open={showClientPicker} onOpenChange={setShowClientPicker} rawContent>
        <ClientPickerSheet
          onPick={(profile) => {
            applyEpochRef.current += 1;
            setClientProfileId(profile.id);
            setClientUserId(profile.userId);
            setClientFullName(profile.fullName);
            setShowClientPicker(false);
          }}
        />
      </AppSheet>

      <AppSheet
        open={showPatternSheet}
        onOpenChange={(open) => {
          if (!open) applyEpochRef.current += 1;
          setShowPatternSheet(open);
        }}
      >
        <PatternSheet onApply={handleApplyPattern} />
      </AppSheet>

      <AppSheet open={showConfirmSheet} onOpenChange={setShowConfirmSheet}>
        {clientProfileId ? (
          <ConfirmSheet
            clientProfileId={clientProfileId}
            selectedSessions={selectedSessions}
            onDone={() => {
              setSelection(clearActiveSelection);
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
            setSelection(clearActiveSelection);
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
      {/* The X (clear) must be a SIBLING of the body Pressable, not nested
          inside it. RN-Web grants the press responder to the outer Pressable,
          so a nested inner Pressable's onPress never fires from a tap — the
          clear looked dead. Splitting them into siblings under a plain View
          row lets each fire independently. */}
      <View
        testID="reservation-client-banner"
        className="flex-row items-center gap-3 rounded-2xl border border-glass-border bg-glass-surface px-4 py-3"
      >
        <Pressable
          testID="reservation-client-banner-open"
          onPress={onPress}
          className="flex-1 flex-row items-center gap-3 active:opacity-70"
          accessibilityRole="button"
        >
          {clientFullName ? (
            <InitialsAvatar name={clientFullName} size={32} />
          ) : (
            <View
              className="items-center justify-center rounded-full bg-glass-surface border border-glass-border"
              style={{ width: 32, height: 32 }}
            >
              <Icon name="user" size={14} />
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
        </Pressable>
        {clientFullName ? (
          <Pressable
            testID="reservation-client-banner-clear"
            onPress={onClear}
            hitSlop={8}
            className="active:opacity-60"
            accessibilityRole="button"
            accessibilityLabel={t("admin.reservations.clearClient", {
              defaultValue: "Ukloni klijenta",
            })}
          >
            <Icon name="x" size={18} />
          </Pressable>
        ) : (
          <Icon name="chevron-right" size={18} />
        )}
      </View>
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
  classification,
  onPress,
}: {
  session: AvailabilitySession;
  selected: boolean;
  classification: SessionClassification;
  onPress: () => void;
}) {
  // The unselectable rules live in lib/admin/reservation-selection —
  // this card only translates the classification into visuals:
  // past/full are dimmed; already-booked gets a tinted-green surface
  // (no opacity drop) so it reads as "claimed" rather than "unavailable".
  // All three states are disabled for tap.
  const { isPast, isFull, isAlreadyBooked, selectable } = classification;
  const disabled = !selectable;
  const dimOpacity = isPast || isFull ? { opacity: 0.45 } : undefined;
  return (
    <Pressable
      testID={`reservation-session-${session.id}`}
      onPress={onPress}
      disabled={disabled}
      style={dimOpacity}
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
          tone={isAlreadyBooked ? "success" : "default"}
        />
      </View>
      {selected ? (
        <View
          pointerEvents="none"
          className="absolute inset-0 border-2 border-accent"
          style={{ borderRadius: CARD_RADIUS }}
        />
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
      className="absolute bottom-0 left-0 right-0 flex-row items-center gap-3 border-t border-glass-border bg-background px-5 py-4"
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

function CancellableBookingCard({
  booking,
  selected,
  onPress,
}: {
  booking: {
    id: string;
    session: {
      id: string;
      startsAt: string;
      endsAt: string;
      classType: { id: string; name: string };
      room: { id: string; name: string } | null;
      trainer: { id: string; fullName: string } | null;
    };
  };
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable testID={`cancel-booking-${booking.id}`} onPress={onPress}>
      <View pointerEvents="none">
        <SessionCard
          time={`${dayjs(booking.session.startsAt).format("HH:mm")} - ${dayjs(booking.session.endsAt).format("HH:mm")}`}
          className={booking.session.classType.name}
          trainerName={booking.session.trainer?.fullName ?? undefined}
          room={booking.session.room?.name ?? undefined}
          // Capacity isn't surfaced on the booking payload — pass 0/0 so
          // the badge renders empty rather than misleading.
          bookedCount={0}
          capacity={0}
          status="available"
        />
      </View>
      {selected ? (
        <View
          pointerEvents="none"
          className="absolute inset-0 border-2 border-danger"
          style={{ borderRadius: CARD_RADIUS }}
        />
      ) : null}
    </Pressable>
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
            testID="reservation-client-picker-search"
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
  onApply: (input: PatternInput) => Promise<void>;
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
  // Applying reaches out for every month the range spans, so it can take a
  // network round-trip per month — hold the button until it lands rather than
  // closing the sheet on a selection that isn't computed yet.
  const [applying, setApplying] = useState(false);
  // A month fetch can fail mid-apply; the sheet is the only surface the
  // admin is looking at, so the failure has to be said here — otherwise the
  // button just snaps back to "Primeni" and the tap looks ignored.
  const [applyError, setApplyError] = useState<string | null>(null);

  async function handleApply() {
    if (weekA.weekdays.length === 0) return;
    if (rhythm === "biweekly" && weekB.weekdays.length === 0) return;
    const parsed = Number(weeksStr);
    const weekCount = Number.isFinite(parsed) && parsed > 0 ? Math.min(52, parsed) : 1;
    setApplying(true);
    setApplyError(null);
    try {
      await onApply({
        rhythm,
        weekA,
        weekB,
        weeks: weekCount,
        // "Today" — via the now() seam so the test stack's anchor pins it.
        rangeStart: dayjs(now()).startOf("day"),
      });
    } catch {
      setApplyError(
        t("admin.reservations.pattern.error", {
          defaultValue: "Nije moguće učitati termine. Pokušaj ponovo.",
        }),
      );
    } finally {
      setApplying(false);
    }
  }

  const aReady = weekA.weekdays.length > 0;
  const bReady = rhythm === "weekly" || weekB.weekdays.length > 0;
  const canApply = aReady && bReady && !applying;

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

      {applyError ? (
        <Text
          testID="reservation-pattern-error"
          className="text-danger font-body-medium"
          style={{ fontSize: 13, lineHeight: 18 }}
        >
          {applyError}
        </Text>
      ) : null}

      <Button
        testID="reservation-pattern-apply"
        onPress={handleApply}
        disabled={!canApply}
      >
        {applying
          ? t("admin.reservations.pattern.applying", { defaultValue: "Primenjujem…" })
          : t("admin.reservations.pattern.apply", { defaultValue: "Primeni" })}
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
  const msNow = nowMs();
  const hasAnyActivePackage = pkgs.some(
    (p) => new Date(p.expiresAt).getTime() > msNow && p.sessionsRemaining > 0,
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
          <Row
            key={name}
            testID={`reservation-confirm-breakdown-${name}`}
            label={name}
            value={String(count)}
          />
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

      <View className="flex-col gap-2 pt-5">
        <Button
          testID="reservation-confirm-sheet-cta"
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
        <Button variant="ghost" disabled={create.isPending} onPress={onCancel}>
          {t("common.close", { defaultValue: "Zatvori" })}
        </Button>
      </View>
    </View>
  );
}

function Row({
  label,
  value,
  testID,
}: {
  label: string;
  value: string;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
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
  const [waiveCharge, setWaiveCharge] = useState(false);
  return (
    <View className="flex-col gap-4">
      <View>
        <Text
          className="text-foreground font-display"
          style={{ fontSize: 22, lineHeight: 28 }}
        >
          {t("admin.reservations.cancelTitle", { count: bookingIds.length })}
        </Text>
        <Text
          className="text-muted"
          style={{ fontSize: 14, lineHeight: 20, paddingTop: 4 }}
        >
          {t("admin.reservations.cancelConfirmBody", {
            defaultValue:
              "Otkazivanja u poslednjim satima pre termina (zavisi od paketa) skinuće jednu sesiju kao kaznu.",
          })}
        </Text>
      </View>

      <SwitchRow
        testID="reservation-cancel-waive-charge-switch"
        label={t("admin.reservations.waiveChargeLabel", {
          defaultValue: "Ne naplaćuj ovu sesiju",
        })}
        hint={t("admin.reservations.waiveChargeHint", {
          defaultValue: "Klijent neće izgubiti sesiju iz paketa.",
        })}
        value={waiveCharge}
        onValueChange={setWaiveCharge}
      />

      <View className="flex-col gap-2 mt-1">
        <Button
          testID="reservation-cancel-confirm-sheet-cta"
          variant="danger"
          disabled={cancelMut.isPending}
          onPress={() => {
            cancelMut.mutate({ bookingIds, waiveCharge }, { onSuccess: onDone });
          }}
        >
          {t("admin.reservations.cancelConfirmCta", { defaultValue: "Otkaži termin" })}
        </Button>
        <Button variant="ghost" disabled={cancelMut.isPending} onPress={onCancel}>
          {t("common.close", { defaultValue: "Zatvori" })}
        </Button>
      </View>
    </View>
  );
}
