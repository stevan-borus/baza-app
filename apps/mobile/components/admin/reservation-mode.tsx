/**
 * Reservation mode — admin-only screen that turns the existing schedule into
 * a multi-select surface bound to one Client. Two ways to populate the
 * selection set:
 *   - Tap individual session cards in the calendar.
 *   - Apply a weekday × time × date-range pattern (overlay sheet), which
 *     adds every matching existing Session in the window to the selection.
 *
 * Both inputs feed the same `selectedSessionIds` set; full / already-booked
 * sessions are never selectable; the confirm sheet shows a per-ClassType
 * breakdown so the admin sees which sessions will be unbacked at the
 * moment of decision.
 */
import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import dayjs from "dayjs";
import Feather from "@expo/vector-icons/Feather";
import { AppSheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/typography";
import { SessionCard } from "@/components/ui/session-card";
import { StudioWeekStrip } from "@/components/ui/studio";
import { startOfLocaleWeek } from "@/components/ui/week-strip";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { EmptyState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";
import { packagesQueries } from "@/lib/queries/packages-queries-factory";
import { useCreateReservationsMutation } from "@/lib/queries/reservations-queries-factory";

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

export function ReservationMode() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "sr";
  const bottomPad = useTabBarBottomPadding(80);
  const params = useLocalSearchParams<ReservationModeParams>();

  const [clientProfileId, setClientProfileId] = useState<string | null>(
    params.clientProfileId ?? null,
  );
  const [clientFullName, setClientFullName] = useState<string | null>(
    params.clientFullName ?? null,
  );
  const [selectedDate, setSelectedDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [weekStart, setWeekStart] = useState(() => startOfLocaleWeek(dayjs()));
  const [month, setMonth] = useState(() => dayjs().format("YYYY-MM"));
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(
    new Set(),
  );
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [showPatternSheet, setShowPatternSheet] = useState(false);
  const [showConfirmSheet, setShowConfirmSheet] = useState(false);

  const availabilityQuery = useQuery(sessionsQueries.availabilityByMonth(month));
  const sessions = (availabilityQuery.data?.sessions ?? []) as AvailabilitySession[];

  const daySessions = sessions
    .filter((s) => dayjs(s.startsAt).format("YYYY-MM-DD") === selectedDate)
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));

  const sessionsByDay = sessions.reduce<Record<string, number>>((acc, s) => {
    const k = dayjs(s.startsAt).format("YYYY-MM-DD");
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  function toggleSession(s: AvailabilitySession) {
    if (s.availableSlots <= 0) return;
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

  function applyPattern(pattern: {
    weekdays: number[]; // 0..6 (Mon..Sun)
    timeOfDayMins: number; // minutes since midnight
    rangeStart: dayjs.Dayjs;
    rangeEnd: dayjs.Dayjs;
  }) {
    const matched = new Set<string>();
    for (const s of sessions) {
      const d = dayjs(s.startsAt);
      const dow = (d.day() + 6) % 7; // convert Sun=0 → Mon=0
      if (!pattern.weekdays.includes(dow)) continue;
      const tod = d.hour() * 60 + d.minute();
      if (tod !== pattern.timeOfDayMins) continue;
      if (d.isBefore(pattern.rangeStart, "day")) continue;
      if (d.isAfter(pattern.rangeEnd, "day")) continue;
      if (s.availableSlots <= 0) continue;
      matched.add(s.id);
    }
    setSelectedSessionIds((prev) => {
      const next = new Set(prev);
      for (const id of matched) next.add(id);
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
          setClientFullName(null);
        }}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: bottomPad + 80 }}
      >
        <View className="pb-4">
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

        <View className="px-5 pb-3">
          <Button
            variant="secondary"
            onPress={() => setShowPatternSheet(true)}
            disabled={!clientProfileId}
          >
            <View className="flex-row items-center gap-2">
              <Feather name="repeat" size={16} />
              <Text className="font-body-medium">
                {t("admin.reservations.applyPattern", { defaultValue: "Primeni obrazac" })}
              </Text>
            </View>
          </Button>
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
                  onPress={() => toggleSession(s)}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <SelectionToolbar
        count={selectedSessionIds.size}
        disabled={!clientProfileId || selectedSessionIds.size === 0}
        onConfirm={() => setShowConfirmSheet(true)}
        onClear={() => setSelectedSessionIds(new Set())}
      />

      <AppSheet open={showClientPicker} onOpenChange={setShowClientPicker}>
        <ClientPickerSheet
          onPick={(profile) => {
            setClientProfileId(profile.id);
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
            clientUserId={params.clientUserId ?? null}
            selectedSessions={sessions.filter((s) => selectedSessionIds.has(s.id))}
            onDone={() => {
              setSelectedSessionIds(new Set());
              setShowConfirmSheet(false);
              router.back();
            }}
            onCancel={() => setShowConfirmSheet(false)}
          />
        ) : null}
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
        <Feather name="user" size={18} />
        <View className="flex-1">
          <Text className="text-xs text-muted" style={{ letterSpacing: 1.2 }}>
            {t("admin.reservations.reservingFor", { defaultValue: "Rezerviše za" }).toUpperCase()}
          </Text>
          <Text className="text-foreground font-body-semibold" style={{ fontSize: 16 }}>
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

function SelectableSessionCard({
  session,
  selected,
  onPress,
}: {
  session: AvailabilitySession;
  selected: boolean;
  onPress: () => void;
}) {
  const isFull = session.availableSlots <= 0;
  return (
    <Pressable onPress={onPress} disabled={isFull} style={{ opacity: isFull ? 0.4 : 1 }}>
      <View
        className={
          selected
            ? "rounded-2xl border-2 border-accent"
            : "rounded-2xl border border-transparent"
        }
      >
        <SessionCard
          testID={`reservation-session-${session.id}`}
          time={`${dayjs(session.startsAt).format("HH:mm")} - ${dayjs(session.endsAt).format("HH:mm")}`}
          className={session.classTypeName}
          trainerName={session.trainerName ?? undefined}
          room={session.roomName ?? undefined}
          bookedCount={session.bookedCount}
          capacity={session.capacity}
          status={isFull ? "full" : "available"}
        />
      </View>
    </Pressable>
  );
}

function SelectionToolbar({
  count,
  disabled,
  onConfirm,
  onClear,
}: {
  count: number;
  disabled: boolean;
  onConfirm: () => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View
      className="absolute bottom-0 left-0 right-0 flex-row items-center gap-3 border-t border-glass-border bg-bg/95 px-5 py-4"
      style={{ paddingBottom: 24 }}
    >
      <View className="flex-1">
        <Text className="text-xs text-muted" style={{ letterSpacing: 1.2 }}>
          {t("admin.reservations.selected", { defaultValue: "Izabrano" }).toUpperCase()}
        </Text>
        <Text className="text-foreground font-body-bold" style={{ fontSize: 18 }}>
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
      <Button onPress={onConfirm} disabled={disabled}>
        <Text className="font-body-semibold text-bg">
          {t("admin.reservations.confirm", { defaultValue: "Rezerviši" })}
        </Text>
      </Button>
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

  return (
    <View className="flex-col gap-3">
      <SectionLabel>
        {t("admin.reservations.pickClient", { defaultValue: "Izaberi klijenta" })}
      </SectionLabel>
      <Input
        placeholder={t("admin.clients.searchPlaceholder", { defaultValue: "Pretraga..." })}
        value={q}
        onChangeText={setQ}
      />
      <ScrollView style={{ maxHeight: 360 }}>
        {rows.map((c) => (
          <Pressable
            key={c.id}
            onPress={() =>
              onPick({
                id: c.id,
                fullName: c.user.fullName,
                userId: c.user.id,
              })
            }
            className="py-3 border-b border-glass-border"
          >
            <Text className="text-foreground font-body-medium">{c.user.fullName}</Text>
            <Text className="text-muted text-xs">{c.user.email}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function PatternSheet({
  onApply,
}: {
  onApply: (input: {
    weekdays: number[];
    timeOfDayMins: number;
    rangeStart: dayjs.Dayjs;
    rangeEnd: dayjs.Dayjs;
  }) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "sr";
  const labels = lang === "en" ? WEEKDAY_LABELS_EN : WEEKDAY_LABELS_SR;
  const [weekdays, setWeekdays] = useState<Set<number>>(new Set());
  const [hh, setHh] = useState("07");
  const [mm, setMm] = useState("00");
  const [weeks, setWeeks] = useState("12");

  function toggle(d: number) {
    setWeekdays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }

  function handleApply() {
    const wd = [...weekdays].sort((a, b) => a - b);
    if (wd.length === 0) return;
    const hour = Math.max(0, Math.min(23, Number(hh) || 0));
    const minute = Math.max(0, Math.min(59, Number(mm) || 0));
    const weekCount = Math.max(1, Math.min(52, Number(weeks) || 1));
    onApply({
      weekdays: wd,
      timeOfDayMins: hour * 60 + minute,
      rangeStart: dayjs().startOf("day"),
      rangeEnd: dayjs().add(weekCount, "week").endOf("day"),
    });
  }

  return (
    <View className="flex-col gap-4">
      <SectionLabel>
        {t("admin.reservations.pattern.title", { defaultValue: "Primeni obrazac" })}
      </SectionLabel>

      <View>
        <Text className="text-xs text-muted pb-2" style={{ letterSpacing: 1.2 }}>
          {t("admin.reservations.pattern.weekdays", { defaultValue: "Dani u nedelji" }).toUpperCase()}
        </Text>
        <View className="flex-row gap-2">
          {labels.map((l, i) => (
            <Pressable
              key={i}
              onPress={() => toggle(i)}
              className={
                weekdays.has(i)
                  ? "h-11 w-11 items-center justify-center rounded-full bg-accent"
                  : "h-11 w-11 items-center justify-center rounded-full border border-glass-border"
              }
            >
              <Text
                className={
                  weekdays.has(i)
                    ? "text-bg font-body-semibold"
                    : "text-foreground font-body-medium"
                }
              >
                {l}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View>
        <Text className="text-xs text-muted pb-2" style={{ letterSpacing: 1.2 }}>
          {t("admin.reservations.pattern.time", { defaultValue: "Vreme" }).toUpperCase()}
        </Text>
        <View className="flex-row items-center gap-2">
          <TextInput
            value={hh}
            onChangeText={setHh}
            keyboardType="numeric"
            maxLength={2}
            className="border border-glass-border rounded-xl px-3 py-2 text-foreground"
            style={{ width: 64, textAlign: "center" }}
          />
          <Text className="text-foreground">:</Text>
          <TextInput
            value={mm}
            onChangeText={setMm}
            keyboardType="numeric"
            maxLength={2}
            className="border border-glass-border rounded-xl px-3 py-2 text-foreground"
            style={{ width: 64, textAlign: "center" }}
          />
        </View>
      </View>

      <View>
        <Text className="text-xs text-muted pb-2" style={{ letterSpacing: 1.2 }}>
          {t("admin.reservations.pattern.weeks", { defaultValue: "Broj nedelja" }).toUpperCase()}
        </Text>
        <TextInput
          value={weeks}
          onChangeText={setWeeks}
          keyboardType="numeric"
          className="border border-glass-border rounded-xl px-3 py-2 text-foreground"
          style={{ width: 96, textAlign: "center" }}
        />
      </View>

      <Button onPress={handleApply} disabled={weekdays.size === 0}>
        <Text className="text-bg font-body-semibold">
          {t("admin.reservations.pattern.apply", { defaultValue: "Primeni obrazac" })}
        </Text>
      </Button>
    </View>
  );
}

function ConfirmSheet({
  clientProfileId,
  clientUserId: _clientUserId,
  selectedSessions,
  onDone,
  onCancel,
}: {
  clientProfileId: string;
  clientUserId: string | null;
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
    <View className="flex-col gap-4">
      <SectionLabel>
        {t("admin.reservations.confirmTitle", {
          defaultValue: "Potvrdi rezervacije",
          count: selectedSessions.length,
        })}
      </SectionLabel>

      <View className="rounded-2xl border border-glass-border p-3">
        <Text className="text-xs text-muted pb-2" style={{ letterSpacing: 1.2 }}>
          {t("admin.reservations.byClassType", { defaultValue: "Po tipu" }).toUpperCase()}
        </Text>
        {byClassType.map(([name, count]) => (
          <View key={name} className="flex-row justify-between py-1">
            <Text className="text-foreground">{name}</Text>
            <Text className="text-muted font-body-medium">{count}</Text>
          </View>
        ))}
      </View>

      {showNoPackageWarning ? (
        <View className="rounded-2xl border border-glass-border p-3">
          <Text className="text-foreground font-body-semibold pb-1">
            {t("admin.reservations.noPackageWarningTitle", {
              defaultValue: "Klijent nema aktivan paket",
            })}
          </Text>
          <Text className="text-muted text-xs">
            {t("admin.reservations.noPackageWarningBody", {
              defaultValue:
                "Rezervacije će ostati, ali se neće skidati iz paketa dok klijent ne kupi.",
            })}
          </Text>
        </View>
      ) : null}

      <View className="flex-row gap-3">
        <Button variant="secondary" className="flex-1" onPress={onCancel}>
          <Text className="font-body-medium">
            {t("admin.clients.cancel", { defaultValue: "Otkaži" })}
          </Text>
        </Button>
        <Button
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
          <Text className="text-bg font-body-semibold">
            {t("admin.reservations.confirm", { defaultValue: "Rezerviši" })}
          </Text>
        </Button>
      </View>
    </View>
  );
}
