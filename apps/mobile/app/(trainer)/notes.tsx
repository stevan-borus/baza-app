/**
 * Trainer Notes screen — filter chips (All / This week / By client), GlassCard note rows,
 * infinite scroll, FAB to open compose sheet.
 * Motion: MotiView stagger on title (0ms) → chips (80ms) → list (160ms).
 */

import { useState, useMemo, useCallback } from "react";
import { useMutation, useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import Feather from "@expo/vector-icons/Feather";
import { MotiView } from "@/components/ui/styled";
import { LegendList } from "@legendapp/list";
import { AppSheet } from "@/components/ui/sheet";
import { ConfirmSheet } from "@/components/ui/confirm-sheet";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { SessionPicker } from "@/components/ui/session-picker";
import { ClientPicker } from "@/components/ui/client-picker";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { HeaderIconButton } from "@/components/ui/app-header";
import { useThemeTokens } from "@/components/ui/tokens";
import { getDateLocale } from "@/lib/i18n";
import { trainerNotesQueries, type TrainerNote } from "@/lib/queries/trainer-notes-queries-factory";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";

// ─── types ───────────────────────────────────────────────────────────────────

/**
 * Time filter — applies independently from the client filter.
 * - "all": all notes
 * - "thisWeek": only notes created since the most recent Monday 00:00
 */
type TimeFilter = "all" | "thisWeek";

// ─── helpers ─────────────────────────────────────────────────────────────────

function startOfWeek(): Date {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday-based
  const monday = new Date(now);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function applyTimeFilter(
  notes: TrainerNote[],
  timeFilter: TimeFilter,
): TrainerNote[] {
  // Client/session filters are pushed to the server via query params now,
  // so this just handles the time predicate (derived from current clock,
  // can't be precomputed server-side without us inventing a flexible
  // "since N" param the client doesn't need yet).
  if (timeFilter === "thisWeek") {
    const weekStart = startOfWeek().getTime();
    return notes.filter((n) => new Date(n.createdAt).getTime() >= weekStart);
  }
  return notes;
}

/**
 * Serbian count plurals: 1 → singular, 2-4 → paucal, 5+ → plural.
 * Numbers ending 11-14 take the plural form regardless of last digit.
 * Mirrors the standard CLDR sr-Latn rules.
 */
function srCountForm(n: number, singular: string, paucal: string, plural: string): string {
  const lastTwo = n % 100;
  const last = n % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return plural;
  if (last === 1) return singular;
  if (last >= 2 && last <= 4) return paucal;
  return plural;
}

// ─── FilterSheetHeader ───────────────────────────────────────────────────────

/**
 * Header used inside the two filter sheets (by-client / by-session) when
 * they're operating in multi-select mode. Title on the left; a "Clear" link
 * and a "Done" button on the right. "Clear" only renders when there's a
 * selection to clear.
 */
function FilterSheetHeader({
  title,
  count,
  onClear,
  onDone,
}: {
  title: string;
  count: number;
  onClear: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const tokens = useThemeTokens();
  // The count is already obvious from the chip on the screen behind +
  // the in-list checkboxes; we don't need a redundant caption here.
  return (
    <View className="flex-row items-center justify-between">
      <Text
        className="text-foreground font-body-bold"
        style={{ fontSize: 18, letterSpacing: -0.3 }}
      >
        {title}
      </Text>
      <View className="flex-row items-center" style={{ gap: 14 }}>
        {count > 0 ? (
          <Pressable
            onPress={onClear}
            hitSlop={8}
            className="active:opacity-60"
            accessibilityRole="button"
          >
            <Text
              className="text-muted font-body-medium"
              style={{ fontSize: 13 }}
            >
              {t("trainer.notes.clearAllVerbose")}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={onDone}
          hitSlop={8}
          className="active:opacity-60"
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
        >
          <Feather name="x" size={20} color={tokens.muted} />
        </Pressable>
      </View>
    </View>
  );
}

// ─── ComposeFieldTrigger ─────────────────────────────────────────────────────

/**
 * Single row used as a trigger inside the compose sheet for the client and
 * session fields. Empty state shows a placeholder + chevron; filled state
 * shows the picked label and an × to clear without re-opening the picker.
 */
function ComposeFieldTrigger({
  icon,
  placeholder,
  label,
  hint,
  onPress,
  onClear,
  emphasis = "default",
  testID,
}: {
  icon?: "user" | "link";
  placeholder: string;
  label: string | null;
  hint?: string | null;
  onPress: () => void;
  onClear?: () => void;
  /**
   * "default" — required field (Klijent). Borders + glass surface always.
   * "subtle"  — optional field (session). Flat text-link look when empty,
   *             promotes to glass surface only when filled.
   */
  emphasis?: "default" | "subtle";
  testID?: string;
}) {
  const tokens = useThemeTokens();
  const isFilled = !!label;
  const showSurface = emphasis === "default" || isFilled;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label ?? placeholder}
      className="active:opacity-70"
    >
      <View
        className="flex-row items-center"
        style={{
          gap: 10,
          paddingVertical: 12,
          paddingHorizontal: showSurface ? 14 : 4,
          borderRadius: 12,
          backgroundColor: showSurface ? tokens.glass : "transparent",
          borderWidth: showSurface ? 1 : 0,
          borderColor: showSurface ? tokens.glassBorder : "transparent",
        }}
      >
        {icon ? (
          <Feather
            name={icon}
            size={14}
            color={isFilled ? tokens.accent : tokens.muted}
          />
        ) : null}
        <View className="flex-1 flex-col" style={{ gap: 2 }}>
          {isFilled ? (
            <>
              <Text
                className="font-body-semibold text-foreground"
                style={{ fontSize: 14 }}
                numberOfLines={1}
              >
                {label}
              </Text>
              {hint ? (
                <Text
                  className="text-muted"
                  style={{ fontSize: 12 }}
                  numberOfLines={1}
                >
                  {hint}
                </Text>
              ) : null}
            </>
          ) : (
            <Text
              className={
                emphasis === "subtle"
                  ? "text-muted font-body-medium"
                  : "text-faint font-body-medium"
              }
              style={{ fontSize: 14 }}
              numberOfLines={1}
            >
              {placeholder}
            </Text>
          )}
        </View>
        {isFilled && onClear ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onClear();
            }}
            hitSlop={10}
            accessibilityRole="button"
          >
            <Feather name="x" size={14} color={tokens.muted} />
          </Pressable>
        ) : (
          <Feather name="chevron-down" size={14} color={tokens.muted} />
        )}
      </View>
    </Pressable>
  );
}

// ─── FilterChip ──────────────────────────────────────────────────────────────

function FilterChip({
  label,
  active,
  trailingIcon,
  onPress,
  onTrailingIconPress,
}: {
  label: string;
  active: boolean;
  trailingIcon?: "chevron-down" | "times";
  onPress: () => void;
  /**
   * Optional handler dedicated to the trailing icon (typically the × on an
   * active filter chip). When provided, the icon becomes its own tap target
   * and stops the press from bubbling to the chip body — so tapping × clears
   * the filter, while tapping the chip body opens the picker.
   */
  onTrailingIconPress?: () => void;
}) {
  // Theme-aware: ink-fill when selected (always legible), faint-bordered
  // ghost when idle. Replaces the old white-on-white chips.
  const tokens = useThemeTokens();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      android_ripple={null}
      className={`flex-row items-center px-3.5 py-2 rounded-full border active:opacity-80 ${
        active
          ? "bg-foreground border-foreground"
          : "border-glass-border"
      }`}
      style={{ gap: 6 }}
    >
      <Text
        className={
          active ? "text-background font-body-semibold" : "text-muted font-body-medium"
        }
        style={{ fontSize: 13, letterSpacing: 0.1 }}
        numberOfLines={1}
      >
        {label}
      </Text>
      {trailingIcon ? (
        onTrailingIconPress ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onTrailingIconPress();
            }}
            hitSlop={8}
          >
            <FontAwesome
              name={trailingIcon}
              size={trailingIcon === "times" ? 11 : 9}
              color={active ? tokens.background : tokens.faint}
            />
          </Pressable>
        ) : (
          <FontAwesome
            name={trailingIcon}
            size={trailingIcon === "times" ? 11 : 9}
            color={active ? tokens.background : tokens.faint}
          />
        )
      ) : null}
    </Pressable>
  );
}

// ─── NoteRow ─────────────────────────────────────────────────────────────────

function NoteRow({
  item,
  dateLocale,
  onPress,
}: {
  item: TrainerNote;
  dateLocale: string;
  onPress?: () => void;
}) {
  const dateStr = new Date(item.createdAt).toLocaleDateString(dateLocale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const preview = item.note.length > 120 ? `${item.note.slice(0, 120)}…` : item.note;

  return (
    <Pressable
      testID={`note-row-${item.id}`}
      onPress={onPress}
      android_ripple={null}
      style={{ marginBottom: 10 }}
      className="active:opacity-70"
    >
      <GlassCard size="md" accentBorder="left">
        <View style={{ gap: 8 }}>
          {/* Primary line: client name. The note is "about" this person. */}
          {item.clientProfile ? (
            <Text
              className="font-body-semibold text-foreground"
              style={{ fontSize: 14, letterSpacing: -0.1 }}
              numberOfLines={1}
            >
              {item.clientProfile.user.fullName}
            </Text>
          ) : null}

          {/* Body — 2-line note preview */}
          <Text
            className="text-foreground"
            style={{ fontSize: 14, lineHeight: 20, opacity: 0.85 }}
            numberOfLines={2}
          >
            {preview}
          </Text>

          {/* Secondary line: trainer · date. Quieter, smaller. */}
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}
          >
            {item.trainer ? (
              <Text
                className="font-body-medium"
                style={{ fontSize: 11, color: "#2e5b42" }}
                numberOfLines={1}
              >
                {item.trainer.fullName}
              </Text>
            ) : null}
            {item.trainer ? (
              <Text className="text-faint" style={{ fontSize: 11 }}>·</Text>
            ) : null}
            <Text className="text-muted" style={{ fontSize: 11 }}>
              {dateStr}
            </Text>
          </View>
        </View>
      </GlassCard>
    </Pressable>
  );
}

// ─── screen ──────────────────────────────────────────────────────────────────

export default function TrainerNotes() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const bottomPad = useTabBarBottomPadding();
  const [showCreate, setShowCreate] = useState(false);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [form, setForm] = useState<{
    sessionId: string;
    clientProfileId: string;
    clientLabel: string;
    note: string;
  }>({ sessionId: "", clientProfileId: "", clientLabel: "", note: "" });
  // Compose sheet sub-sheets: client and session pickers each open their own
  // bottom sheet stacked over the compose one. Keeps the main sheet short
  // (only the trigger rows + note input + save are visible at once).
  const [showComposeClientPicker, setShowComposeClientPicker] = useState(false);
  const [showComposeSessionPicker, setShowComposeSessionPicker] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  // Multi-select filters. Empty set = "no filter active in this dimension".
  // applyFilters AND-composes across dimensions; OR-composes within.
  const [selectedClientIds, setSelectedClientIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [selectedClientNames, setSelectedClientNames] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [selectedSessionIds, setSelectedSessionIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dateLocale = getDateLocale();

  // Server-side filter pushdown: pass the selected client/session sets as
  // query params so deep matches surface even when the unfiltered head
  // doesn't contain them. The query key already encodes these (stableKey
  // in the factory) so refetches and cache hits are correct.
  const notesQuery = useInfiniteQuery(
    trainerNotesQueries.listInfinite({
      clientProfileIds:
        selectedClientIds.size > 0 ? Array.from(selectedClientIds) : undefined,
      sessionIds:
        selectedSessionIds.size > 0 ? Array.from(selectedSessionIds) : undefined,
    }),
  );
  const sessionsQuery = useQuery(sessionsQueries.list());
  // When the compose-sheet session is picked, fetch its detail so we can
  // scope the client picker to the people actually booked into that class.
  // Without a session the user gets the full searchable client list instead.
  const composeSessionDetailQuery = useQuery({
    ...sessionsQueries.byId(form.sessionId),
    enabled: !!form.sessionId,
  });
  const scopedComposeClients = useMemo(() => {
    const bookings = composeSessionDetailQuery.data?.session.bookings ?? [];
    return bookings.map((b) => ({
      id: b.clientProfileId,
      user: {
        id: b.client.id,
        fullName: b.client.fullName,
        email: b.client.email,
      },
    }));
  }, [composeSessionDetailQuery.data]);

  const createMutation = useMutation({
    ...trainerNotesQueries.create(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["trainer-notes"] });
      setShowCreate(false);
      setForm({ sessionId: "", clientProfileId: "", clientLabel: "", note: "" });
    },
  });

  const updateMutation = useMutation({
    ...trainerNotesQueries.update(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["trainer-notes"] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    ...trainerNotesQueries.delete(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["trainer-notes"] });
      setConfirmDelete(false);
      setEditingId(null);
    },
  });

  function openEdit(note: TrainerNote) {
    setEditText(note.note);
    setEditingId(note.id);
  }

  const allNotes = notesQuery.data?.pages.flatMap((p) => p.notes) ?? [];
  const filteredNotes = useMemo(
    () => applyTimeFilter(allNotes, timeFilter),
    [allNotes, timeFilter],
  );

  type ListItem = { kind: "row"; note: TrainerNote; id: string };

  const listData = useMemo<ListItem[]>(
    () => filteredNotes.map((n) => ({ kind: "row" as const, note: n, id: n.id })),
    [filteredNotes],
  );

  async function handleRefresh() {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["trainer-notes"] });
    setRefreshing(false);
  }

  function handleEndReached() {
    if (notesQuery.hasNextPage && !notesQuery.isFetchingNextPage) notesQuery.fetchNextPage();
  }

  // Client filter chip: count-based when multiple, name when exactly one,
  // placeholder when empty. The placeholder text changes with i18n.
  const clientChipLabel = useMemo(() => {
    const count = selectedClientIds.size;
    if (count === 0) return t("trainer.notes.filterByClient");
    if (count === 1) {
      const onlyId = [...selectedClientIds][0]!;
      return selectedClientNames.get(onlyId) ?? t("trainer.notes.oneClientSelected");
    }
    return `${count} ${srCountForm(
      count,
      t("trainer.notes.clientWord.one"),
      t("trainer.notes.clientWord.few"),
      t("trainer.notes.clientWord.many"),
    )}`;
  }, [selectedClientIds, selectedClientNames, t]);

  const sessionChipLabel = useMemo(() => {
    const count = selectedSessionIds.size;
    if (count === 0) return t("trainer.notes.filterBySession");
    if (count === 1) {
      const onlyId = [...selectedSessionIds][0]!;
      const s = sessionsQuery.data?.sessions.find((x) => x.id === onlyId);
      if (!s) return t("trainer.notes.oneSessionSelected");
      const dateStr = new Date(s.startsAt).toLocaleDateString(dateLocale, {
        month: "short",
        day: "numeric",
      });
      return `${s.classType?.name ?? t("trainer.clients.sessionName")} · ${dateStr}`;
    }
    return `${count} ${srCountForm(
      count,
      t("trainer.notes.sessionWord.one"),
      t("trainer.notes.sessionWord.few"),
      t("trainer.notes.sessionWord.many"),
    )}`;
  }, [selectedSessionIds, sessionsQuery.data, dateLocale, t]);

  // Summary labels for the compose-sheet session trigger row.
  const composeSessionLabel = useMemo(() => {
    if (!form.sessionId) return null;
    const s = sessionsQuery.data?.sessions.find((x) => x.id === form.sessionId);
    return s?.classType?.name ?? t("trainer.clients.sessionName");
  }, [form.sessionId, sessionsQuery.data, t]);
  const composeSessionHint = useMemo(() => {
    if (!form.sessionId) return null;
    const s = sessionsQuery.data?.sessions.find((x) => x.id === form.sessionId);
    if (!s) return null;
    return new Date(s.startsAt).toLocaleDateString(dateLocale, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [form.sessionId, sessionsQuery.data, dateLocale]);

  // Toggle helpers — used by both filter sheets in multi-select mode.
  const toggleClientId = useCallback(
    (id: string) => {
      setSelectedClientIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      // Cache the picked client's name for the chip's single-selection
      // label. Re-reading from the query cache here so we don't need to
      // round-trip the API to render the chip.
      setSelectedClientNames((prev) => {
        const cached = queryClient.getQueryData<{
          pages: { clients: { id: string; user: { fullName: string } }[] }[];
        }>(["clients", "list", { q: "", take: 20 }]);
        const found = cached?.pages
          .flatMap((p) => p.clients)
          .find((c) => c.id === id);
        if (!found) return prev;
        const next = new Map(prev);
        next.set(id, found.user.fullName);
        return next;
      });
    },
    [queryClient],
  );

  const toggleSessionId = useCallback((id: string) => {
    setSelectedSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  function clearClientFilter() {
    setSelectedClientIds(new Set());
    setSelectedClientNames(new Map());
  }

  function clearSessionFilter() {
    setSelectedSessionIds(new Set());
  }

  return (
    <ScreenContainerRaw
      title={t("tabs.notes")}
      rightSlot={
        <HeaderIconButton
          icon="plus"
          onPress={() => setShowCreate(true)}
          accessibilityLabel={t("trainer.notes.newNote")}
          testID="trainer-new-note-button"
        />
      }
    >
      {/* ── Filter chips ── */}
      <MotiView
        from={{ opacity: 0, translateY: 6 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 380, delay: 80 }}
        style={{ paddingTop: 8 }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8, flexDirection: "row" }}
          style={{ flexGrow: 0 }}
        >
          <FilterChip
            label={t("trainer.notes.filterAll")}
            active={timeFilter === "all"}
            onPress={() => setTimeFilter("all")}
          />
          <FilterChip
            label={t("trainer.notes.filterThisWeek")}
            active={timeFilter === "thisWeek"}
            onPress={() => setTimeFilter("thisWeek")}
          />
          <FilterChip
            label={clientChipLabel}
            active={selectedClientIds.size > 0}
            trailingIcon={selectedClientIds.size > 0 ? "times" : "chevron-down"}
            onPress={() => setShowClientPicker(true)}
            onTrailingIconPress={
              selectedClientIds.size > 0 ? clearClientFilter : undefined
            }
          />
          <View testID="note-filter-by-session">
            <FilterChip
              label={sessionChipLabel}
              active={selectedSessionIds.size > 0}
              trailingIcon={selectedSessionIds.size > 0 ? "times" : "chevron-down"}
              onPress={() => setShowSessionPicker(true)}
              onTrailingIconPress={
                selectedSessionIds.size > 0 ? clearSessionFilter : undefined
              }
            />
          </View>
        </ScrollView>
      </MotiView>

      {/* ── Error / empty states ── */}
      {notesQuery.isError ? (
        <View style={{ paddingHorizontal: 20 }}>
          <ErrorState message={t("trainer.notes.error")} />
        </View>
      ) : null}

      {/* ── Note list ── */}
      <MotiView
        from={{ opacity: 0, translateY: 12 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 400, delay: 160 }}
        style={{ flex: 1 }}
      >
        <LegendList
          data={listData}
          keyExtractor={(item: ListItem) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#2e5b42"
              colors={["#2e5b42"]}
            />
          }
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: bottomPad }}
          renderItem={({ item }: { item: ListItem }) => (
            <NoteRow
              item={item.note}
              dateLocale={dateLocale}
              onPress={() => openEdit(item.note)}
            />
          )}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            !notesQuery.isLoading ? (
              <EmptyState title={t("trainer.notes.empty")} />
            ) : null
          }
          ListFooterComponent={
            notesQuery.isFetchingNextPage ? (
              <ActivityIndicator style={{ padding: 16 }} />
            ) : null
          }
          estimatedItemSize={80}
        />
      </MotiView>

      {/* ── Client picker sheet (for "By client" filter, multi-select) ── */}
      <AppSheet open={showClientPicker} onOpenChange={setShowClientPicker}>
        <View className="flex-col gap-4 pb-5">
          <FilterSheetHeader
            title={t("trainer.notes.pickClientTitle")}
            count={selectedClientIds.size}
            onClear={clearClientFilter}
            onDone={() => setShowClientPicker(false)}
          />
          <ClientPicker
            testID="client-filter-picker"
            optionTestIDPrefix="client-filter-option"
            selectedIds={selectedClientIds}
            onToggle={toggleClientId}
          />
        </View>
      </AppSheet>

      {/* ── Compose sheet ──
          Option A layout (chosen over inline pickers): the sheet shows ONLY
          a client trigger row, a large note input, a subtle session trigger
          row, and Save. Each picker opens its own stacked sub-sheet so the
          compose sheet itself stays short and the note text is the
          dominant element.
      */}
      <AppSheet open={showCreate} onOpenChange={setShowCreate}>
        <View className="flex-col gap-4 pb-5">
          <Text
            className="text-foreground font-body-bold"
            style={{ fontSize: 20, letterSpacing: -0.3 }}
          >
            {t("trainer.notes.sheetTitle")}
          </Text>

          {/* CLIENT trigger (required) */}
          <ComposeFieldTrigger
            testID="note-client-trigger"
            icon="user"
            placeholder={t("trainer.notes.pickClientCta")}
            label={form.clientProfileId ? form.clientLabel : null}
            onPress={() => setShowComposeClientPicker(true)}
            onClear={() => {
              setForm((f) => ({
                ...f,
                clientProfileId: "",
                clientLabel: "",
              }));
            }}
          />

          {/* NOTE TEXT (required) — the dominant field. Auto-focuses so
              the keyboard appears immediately, since the most common flow
              is "open compose → start typing". */}
          <Input
            testID="note-text-input"
            placeholder={t("trainer.notes.placeholder")}
            multiline
            value={form.note}
            onChangeText={(v) => setForm((f) => ({ ...f, note: v }))}
            style={{ minHeight: 120 }}
          />

          {/* SESSION trigger (optional, subtle) */}
          <ComposeFieldTrigger
            testID="note-session-trigger"
            icon="link"
            emphasis="subtle"
            placeholder={t("trainer.notes.linkSessionOptional")}
            label={composeSessionLabel}
            hint={composeSessionHint}
            onPress={() => setShowComposeSessionPicker(true)}
            onClear={() => {
              setForm((f) => ({
                ...f,
                sessionId: "",
                // If the client was picked from the now-irrelevant scoped
                // list, clear them too so we don't submit a stale pairing.
                clientProfileId: scopedComposeClients.some(
                  (c) => c.id === f.clientProfileId,
                )
                  ? ""
                  : f.clientProfileId,
                clientLabel: scopedComposeClients.some(
                  (c) => c.id === f.clientProfileId,
                )
                  ? ""
                  : f.clientLabel,
              }));
            }}
          />

          <Button
            testID="note-save-button"
            disabled={
              createMutation.isPending ||
              !form.clientProfileId ||
              !form.note
            }
            onPress={() =>
              createMutation.mutate({
                clientProfileId: form.clientProfileId,
                note: form.note,
                ...(form.sessionId ? { sessionId: form.sessionId } : {}),
              })
            }
          >
            {t("admin.clients.save")}
          </Button>
          {createMutation.isError ? (
            <ErrorState message={t("trainer.notes.saveError")} />
          ) : null}
        </View>
      </AppSheet>

      {/* ── Compose client picker sub-sheet ── */}
      <AppSheet
        open={showComposeClientPicker}
        onOpenChange={setShowComposeClientPicker}
      >
        <View className="flex-col gap-4 pb-5">
          <View className="flex-row items-center justify-between">
            <Text
              className="text-foreground font-body-bold"
              style={{ fontSize: 18, letterSpacing: -0.3 }}
            >
              {t("trainer.notes.pickClientCta")}
            </Text>
            <Pressable
              onPress={() => setShowComposeClientPicker(false)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
              className="active:opacity-60"
            >
              <Feather name="x" size={20} color="#888" />
            </Pressable>
          </View>
          {form.sessionId ? (
            <ClientPicker
              mode="scoped"
              testID="note-client-picker-scoped"
              optionTestIDPrefix="note-client-option"
              clients={scopedComposeClients}
              selectedId={form.clientProfileId || null}
              onSelect={(id) => {
                // Toggle: same row clears, different row picks. Matches
                // the "I tap the card again to deselect" expectation.
                if (id === form.clientProfileId) {
                  setForm((f) => ({
                    ...f,
                    clientProfileId: "",
                    clientLabel: "",
                  }));
                } else {
                  const picked = scopedComposeClients.find((c) => c.id === id);
                  setForm((f) => ({
                    ...f,
                    clientProfileId: id,
                    clientLabel: picked?.user.fullName ?? "",
                  }));
                  setShowComposeClientPicker(false);
                }
              }}
              emptyText={t("trainer.notes.noBookedClients")}
            />
          ) : (
            <ClientPicker
              testID="note-client-picker"
              optionTestIDPrefix="note-client-option"
              selectedId={form.clientProfileId || null}
              onSelect={(id) => {
                if (id === form.clientProfileId) {
                  setForm((f) => ({
                    ...f,
                    clientProfileId: "",
                    clientLabel: "",
                  }));
                  return;
                }
                const cached = queryClient.getQueryData<{
                  pages: { clients: { id: string; user: { fullName: string } }[] }[];
                }>(["clients", "list", { q: "", take: 20 }]);
                const found = cached?.pages
                  .flatMap((p) => p.clients)
                  .find((c) => c.id === id);
                setForm((f) => ({
                  ...f,
                  clientProfileId: id,
                  clientLabel: found?.user.fullName ?? "",
                }));
                setShowComposeClientPicker(false);
              }}
            />
          )}
        </View>
      </AppSheet>

      {/* ── Compose session picker sub-sheet ── */}
      <AppSheet
        open={showComposeSessionPicker}
        onOpenChange={setShowComposeSessionPicker}
      >
        <View className="flex-col gap-4 pb-5">
          <View className="flex-row items-center justify-between">
            <Text
              className="text-foreground font-body-bold"
              style={{ fontSize: 18, letterSpacing: -0.3 }}
            >
              {t("trainer.notes.linkSessionOptional")}
            </Text>
            <Pressable
              onPress={() => setShowComposeSessionPicker(false)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
              className="active:opacity-60"
            >
              <Feather name="x" size={20} color="#888" />
            </Pressable>
          </View>
          <SessionPicker
            testID="note-session-picker"
            optionTestIDPrefix="note-session-option"
            sessions={sessionsQuery.data?.sessions ?? []}
            selectedId={form.sessionId || null}
            onSelect={(id) => {
              // Toggle: tapping same session clears it; different switches
              // and may invalidate the client (scoped roster changes).
              if (id === form.sessionId) {
                setForm((f) => ({
                  ...f,
                  sessionId: "",
                  clientProfileId: scopedComposeClients.some(
                    (c) => c.id === f.clientProfileId,
                  )
                    ? ""
                    : f.clientProfileId,
                  clientLabel: scopedComposeClients.some(
                    (c) => c.id === f.clientProfileId,
                  )
                    ? ""
                    : f.clientLabel,
                }));
                return;
              }
              setForm((f) => ({
                ...f,
                sessionId: id,
                clientProfileId:
                  id && id !== f.sessionId ? "" : f.clientProfileId,
                clientLabel:
                  id && id !== f.sessionId ? "" : f.clientLabel,
              }));
              setShowComposeSessionPicker(false);
            }}
            scheduledOnly
          />
        </View>
      </AppSheet>

      {/* ── Session picker sheet (for "By session" filter, multi-select) ── */}
      <AppSheet open={showSessionPicker} onOpenChange={setShowSessionPicker}>
        <View className="flex-col gap-4 pb-5">
          <FilterSheetHeader
            title={t("trainer.notes.pickSessionTitle")}
            count={selectedSessionIds.size}
            onClear={clearSessionFilter}
            onDone={() => setShowSessionPicker(false)}
          />
          <SessionPicker
            testID="session-filter-picker"
            optionTestIDPrefix="session-filter-option"
            sessions={sessionsQuery.data?.sessions ?? []}
            selectedIds={selectedSessionIds}
            onToggle={toggleSessionId}
          />
        </View>
      </AppSheet>

      {/* ── Edit note sheet ── */}
      <AppSheet
        open={!!editingId}
        onOpenChange={(v) => !v && setEditingId(null)}
      >
        <View className="flex-col gap-4 pb-5">
          <Text
            className="text-foreground font-body-bold"
            style={{ fontSize: 20, letterSpacing: -0.3 }}
          >
            {t("trainer.notes.editSheetTitle")}
          </Text>
          <Input
            testID="note-edit-text-input"
            placeholder={t("trainer.notes.placeholder")}
            multiline
            value={editText}
            onChangeText={setEditText}
          />
          <Button
            testID="note-edit-save-button"
            disabled={updateMutation.isPending || !editText.trim()}
            onPress={() => {
              if (!editingId) return;
              updateMutation.mutate({ id: editingId, note: editText.trim() });
            }}
          >
            {t("admin.schedule.saveChanges")}
          </Button>
          <Button
            testID="note-edit-delete-button"
            variant="danger"
            disabled={deleteMutation.isPending || !editingId}
            onPress={() => setConfirmDelete(true)}
          >
            {t("confirm.deleteNoteConfirm")}
          </Button>
          {updateMutation.isError ? (
            <ErrorState
              message={
                (updateMutation.error as Error)?.message ??
                t("trainer.notes.saveError")
              }
            />
          ) : null}
        </View>
      </AppSheet>
      <ConfirmSheet
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("confirm.deleteNoteTitle")}
        message={t("confirm.deleteNoteMessage")}
        confirmLabel={t("confirm.deleteNoteConfirm")}
        loading={deleteMutation.isPending}
        testID="note-delete-confirm-button"
        errorMessage={
          deleteMutation.isError
            ? (deleteMutation.error as Error)?.message ?? null
            : null
        }
        onConfirm={() => {
          if (!editingId) return;
          deleteMutation.mutate(editingId);
        }}
      />
    </ScreenContainerRaw>
  );
}
