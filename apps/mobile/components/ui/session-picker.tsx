/**
 * SessionPicker — week-view session picker for the trainer notes flow.
 *
 * Two selection models share the same picker:
 *   - Single-select (compose sheet): pass `selectedId` + `onSelect`. Tapping
 *     a row calls `onSelect(id)`; parent is expected to close the sheet.
 *   - Multi-select (filter sheets): pass `selectedIds` + `onToggle`. Tapping
 *     a row toggles membership; the sheet stays open until the user
 *     explicitly dismisses (swipe / backdrop / "Done").
 *
 * No search mode — at trainer scope (~30–80 sessions/month) the week view
 * covers every realistic case. The day with no sessions shows quiet faint
 * text below the strip rather than a heavy empty-state hero.
 */
import { type ReactNode, useMemo, useState } from "react";
import dayjs from "dayjs";
import { Pressable, ScrollView, Text, View } from "react-native";
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import Feather from "@expo/vector-icons/Feather";
import { useTranslation } from "react-i18next";
import { GlassCard } from "./glass-card";
import { WeekStrip, startOfLocaleWeek } from "./week-strip";
import { EmptyState } from "./states";
import { useThemeTokens } from "./tokens";
import { getDateLocale } from "@/lib/i18n";

export type SessionPickerItem = {
  id: string;
  startsAt: string;
  classType?: { name: string } | null;
  room?: { name: string } | null;
  status?: "SCHEDULED" | "CANCELED" | "COMPLETED";
};

type CommonProps = {
  sessions: SessionPickerItem[];
  scheduledOnly?: boolean;
  testID?: string;
  optionTestIDPrefix?: string;
  /**
   * When true, renders via `BottomSheetFlatList` (no inner maxHeight) so the
   * day's sessions scroll in the sheet's own gesture context. Use ONLY inside
   * an `AppSheet` with `rawContent` + a fixed `snapPoint`. See ClientPicker's
   * `bottomSheet` note for why the default nested-scroll path mis-sizes.
   */
  bottomSheet?: boolean;
  /** Content rendered above the week strip (title) when `bottomSheet`. */
  header?: ReactNode;
};

type SingleProps = CommonProps & {
  selectedId: string | null;
  onSelect: (id: string) => void;
  selectedIds?: never;
  onToggle?: never;
};

type MultiProps = CommonProps & {
  selectedIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
  selectedId?: never;
  onSelect?: never;
};

export function SessionPicker(props: SingleProps | MultiProps) {
  const { sessions, scheduledOnly = false, testID, optionTestIDPrefix, bottomSheet, header } =
    props;
  const { t } = useTranslation();
  const tokens = useThemeTokens();
  const dateLocale = getDateLocale();
  const isMulti = "selectedIds" in props && props.selectedIds !== undefined;

  const filtered = useMemo(
    () =>
      scheduledOnly
        ? sessions.filter((s) => s.status === "SCHEDULED" || s.status === undefined)
        : sessions,
    [sessions, scheduledOnly],
  );

  const [selectedDate, setSelectedDate] = useState(() =>
    dayjs().format("YYYY-MM-DD"),
  );
  const [weekStart, setWeekStart] = useState(() => startOfLocaleWeek(dayjs()));

  const activityByDate = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const s of filtered) {
      map[dayjs(s.startsAt).format("YYYY-MM-DD")] = true;
    }
    return map;
  }, [filtered]);

  const sessionsForSelectedDay = useMemo(() => {
    const dayStart = dayjs(selectedDate).startOf("day").valueOf();
    const dayEnd = dayjs(selectedDate).endOf("day").valueOf();
    return filtered
      .filter((s) => {
        const ts = new Date(s.startsAt).getTime();
        return ts >= dayStart && ts <= dayEnd;
      })
      .sort(
        (a, b) =>
          new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
      );
  }, [filtered, selectedDate]);

  function isRowSelected(id: string): boolean {
    return isMulti
      ? (props as MultiProps).selectedIds.has(id)
      : (props as SingleProps).selectedId === id;
  }

  function handleRowPress(id: string) {
    if (isMulti) {
      (props as MultiProps).onToggle(id);
    } else {
      (props as SingleProps).onSelect(id);
    }
  }

  function SessionRow({ s }: { s: SessionPickerItem }) {
    const selected = isRowSelected(s.id);
    const d = new Date(s.startsAt);
    const time = d.toLocaleTimeString(dateLocale, {
      hour: "2-digit",
      minute: "2-digit",
    });
    const className = s.classType?.name ?? t("trainer.clients.sessionName");
    const room = s.room?.name ?? null;

    return (
      <Pressable
        testID={
          optionTestIDPrefix ? `${optionTestIDPrefix}-${s.id}` : undefined
        }
        onPress={() => handleRowPress(s.id)}
        accessibilityRole={isMulti ? "checkbox" : "button"}
        accessibilityState={
          isMulti ? { checked: selected } : { selected }
        }
        accessibilityLabel={`${className} ${time}`}
        className="active:opacity-80"
        style={{ marginBottom: 8 }}
      >
        <GlassCard size="sm" accentBorder={selected ? "left" : undefined}>
          <View className="flex-row items-center" style={{ gap: 12 }}>
            <View
              style={{
                width: 56,
                alignItems: "center",
                paddingVertical: 4,
                borderRightWidth: 1,
                borderRightColor: tokens.glassBorder,
              }}
            >
              <Text
                className="font-body-bold text-foreground"
                style={{ fontSize: 15, letterSpacing: -0.2 }}
              >
                {time}
              </Text>
            </View>
            <View className="flex-1 flex-col" style={{ gap: 2 }}>
              <Text
                className="font-body-semibold text-foreground"
                style={{ fontSize: 14 }}
                numberOfLines={1}
              >
                {className}
              </Text>
              {room ? (
                <Text
                  className="text-muted"
                  style={{ fontSize: 12 }}
                  numberOfLines={1}
                >
                  {room}
                </Text>
              ) : null}
            </View>
            <SelectionIndicator selected={selected} multi={isMulti} />
          </View>
        </GlassCard>
      </Pressable>
    );
  }

  const weekStrip = (
    <WeekStrip
      selectedDate={selectedDate}
      onSelectDate={setSelectedDate}
      weekStart={weekStart}
      onPrevWeek={() => setWeekStart((w) => w.subtract(7, "day"))}
      onNextWeek={() => setWeekStart((w) => w.add(7, "day"))}
      activity={activityByDate}
    />
  );

  // Inside a rawContent sheet: title + week strip pinned above a flexed
  // BottomSheetFlatList of the day's sessions, so only the rows scroll and the
  // week strip stays put. The list is the sheet's own scroll gesture context.
  if (bottomSheet) {
    return (
      <View testID={testID} style={{ flex: 1 }}>
        <View style={{ gap: 16, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16 }}>
          {header}
          {weekStrip}
        </View>
        <BottomSheetFlatList
          data={sessionsForSelectedDay}
          keyExtractor={(s) => s.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
          renderItem={({ item }) => <SessionRow s={item} />}
          ListEmptyComponent={<EmptyState title={t("trainer.sessionPicker.emptyDay")} />}
        />
      </View>
    );
  }

  return (
    <View testID={testID} style={{ gap: 16 }}>
      {weekStrip}
      <ScrollView
        style={{ maxHeight: 260 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {sessionsForSelectedDay.length === 0 ? (
          <EmptyState title={t("trainer.sessionPicker.emptyDay")} />
        ) : (
          sessionsForSelectedDay.map((s) => <SessionRow key={s.id} s={s} />)
        )}
      </ScrollView>
    </View>
  );
}

function SelectionIndicator({
  selected,
  multi,
}: {
  selected: boolean;
  multi: boolean;
}) {
  const tokens = useThemeTokens();
  if (multi) {
    return (
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          borderWidth: 1.5,
          borderColor: selected ? tokens.accent : tokens.glassBorder,
          backgroundColor: selected ? tokens.accent : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {selected ? (
          <Feather name="check" size={14} color={tokens.background} />
        ) : null}
      </View>
    );
  }
  return selected ? (
    <Feather name="check" size={16} color={tokens.accent} />
  ) : null;
}
