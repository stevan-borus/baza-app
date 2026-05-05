/**
 * Trainer Notes screen — filter chips (All / This week / By client), GlassCard note rows,
 * infinite scroll, FAB to open compose sheet.
 * Motion: MotiView stagger on title (0ms) → chips (80ms) → list (160ms).
 */

import { useState, useMemo } from "react";
import { useMutation, useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { MotiView } from "@/components/ui/styled";
import { LegendList } from "@legendapp/list";
import { AppSheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { HeaderIconButton } from "@/components/ui/app-header";
import { useThemeTokens } from "@/components/ui/tokens";
import { getDateLocale } from "@/lib/i18n";
import { trainerNotesQueries, type TrainerNote } from "@/lib/queries/trainer-notes-queries-factory";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";

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

function applyFilters(
  notes: TrainerNote[],
  timeFilter: TimeFilter,
  clientId: string | null,
): TrainerNote[] {
  let out = notes;
  if (timeFilter === "thisWeek") {
    const weekStart = startOfWeek().getTime();
    out = out.filter((n) => new Date(n.createdAt).getTime() >= weekStart);
  }
  if (clientId) {
    out = out.filter((n) => n.clientProfileId === clientId);
  }
  return out;
}

// ─── FilterChip ──────────────────────────────────────────────────────────────

function FilterChip({
  label,
  active,
  trailingIcon,
  onPress,
}: {
  label: string;
  active: boolean;
  trailingIcon?: "chevron-down" | "times";
  onPress: () => void;
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
        <FontAwesome
          name={trailingIcon}
          size={trailingIcon === "times" ? 11 : 9}
          color={active ? tokens.background : tokens.faint}
        />
      ) : null}
    </Pressable>
  );
}

// ─── NoteRow ─────────────────────────────────────────────────────────────────

function NoteRow({ item, dateLocale }: { item: TrainerNote; dateLocale: string }) {
  const dateStr = new Date(item.createdAt).toLocaleDateString(dateLocale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  // Trim note to ~2 lines for preview
  const preview = item.note.length > 120 ? `${item.note.slice(0, 120)}…` : item.note;

  return (
    <View style={{ marginBottom: 10 }}>
      <GlassCard size="md" accentBorder="left">
        <View style={{ gap: 6 }}>
          {/* Meta row: client name · trainer · date */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {item.clientProfile ? (
              <Text
                style={{ fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.9)" }}
                numberOfLines={1}
              >
                {item.clientProfile.user.fullName}
              </Text>
            ) : null}
            {item.clientProfile && item.trainer ? (
              <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>·</Text>
            ) : null}
            {item.trainer ? (
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#4caf80" }}>
                {item.trainer.fullName}
              </Text>
            ) : null}
            <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>·</Text>
            <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{dateStr}</Text>
          </View>

          {/* 2-line note preview */}
          <Text
            style={{ fontSize: 14, color: "rgba(255,255,255,0.85)", lineHeight: 20 }}
            numberOfLines={2}
          >
            {preview}
          </Text>
        </View>
      </GlassCard>
    </View>
  );
}

// ─── screen ──────────────────────────────────────────────────────────────────

export default function TrainerNotes() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const bottomPad = useTabBarBottomPadding();
  const [showCreate, setShowCreate] = useState(false);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [form, setForm] = useState({ sessionId: "", clientProfileId: "", note: "" });
  const [refreshing, setRefreshing] = useState(false);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const dateLocale = getDateLocale();

  const notesQuery = useInfiniteQuery(trainerNotesQueries.listInfinite());
  const sessionsQuery = useQuery(sessionsQueries.list());
  const clientsQuery = useQuery(clientsQueries.list());

  const createMutation = useMutation({
    ...trainerNotesQueries.create(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["trainer-notes"] });
      setShowCreate(false);
      setForm({ sessionId: "", clientProfileId: "", note: "" });
    },
  });

  const allNotes = notesQuery.data?.pages.flatMap((p) => p.notes) ?? [];
  const filteredNotes = useMemo(
    () => applyFilters(allNotes, timeFilter, selectedClientId),
    [allNotes, timeFilter, selectedClientId],
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

  const selectedClient = clientsQuery.data?.clients.find(
    (c) => c.id === selectedClientId,
  );
  const clientChipLabel = selectedClient
    ? selectedClient.user.fullName
    : t("trainer.notes.filterByClient");

  return (
    <ScreenContainerRaw
      title={t("tabs.notes")}
      rightSlot={
        <HeaderIconButton
          icon="plus"
          onPress={() => setShowCreate(true)}
          accessibilityLabel={t("trainer.notes.newNote")}
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
            active={!!selectedClient}
            trailingIcon={selectedClient ? "times" : "chevron-down"}
            onPress={() => {
              if (selectedClient) {
                setSelectedClientId(null);
              } else {
                setShowClientPicker(true);
              }
            }}
          />
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
            <NoteRow item={item.note} dateLocale={dateLocale} />
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

      {/* ── Client picker sheet (for "By client" filter) ── */}
      <AppSheet open={showClientPicker} onOpenChange={setShowClientPicker}>
        <View className="flex-col gap-4 pb-5">
          <Text
            className="text-foreground font-body-bold"
            style={{ fontSize: 20, letterSpacing: -0.3 }}
          >
            {t("trainer.notes.pickClientTitle")}
          </Text>
          <Select
            placeholder={t("trainer.notes.client")}
            value={selectedClientId ?? ""}
            onChange={(v) => {
              setSelectedClientId(v || null);
              setShowClientPicker(false);
            }}
            emptyText={t("trainer.notes.emptyClients")}
            options={(clientsQuery.data?.clients ?? []).map((c) => ({
              value: c.id,
              label: c.user.fullName,
            }))}
          />
        </View>
      </AppSheet>

      {/* ── Compose sheet ── */}
      <AppSheet open={showCreate} onOpenChange={setShowCreate}>
        <View className="flex-col gap-5 pb-5">
          <Text
            className="text-foreground font-body-bold"
            style={{ fontSize: 20, letterSpacing: -0.3 }}
          >
            {t("trainer.notes.sheetTitle")}
          </Text>

          <Select
            placeholder={t("trainer.notes.session")}
            value={form.sessionId}
            onChange={(v) => setForm((f) => ({ ...f, sessionId: v }))}
            emptyText={t("trainer.notes.emptySessions")}
            options={(sessionsQuery.data?.sessions ?? [])
              .filter((s) => s.status === "SCHEDULED")
              .map((s) => ({
                value: s.id,
                label: s.classType?.name ?? t("trainer.clients.sessionName"),
                hint: new Date(s.startsAt).toLocaleDateString(dateLocale, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              }))}
          />

          <Select
            placeholder={t("trainer.notes.client")}
            value={form.clientProfileId}
            onChange={(v) => setForm((f) => ({ ...f, clientProfileId: v }))}
            emptyText={t("trainer.notes.emptyClients")}
            options={(clientsQuery.data?.clients ?? []).map((c) => ({
              value: c.id,
              label: c.user.fullName,
            }))}
          />

          <Input
            placeholder={t("trainer.notes.placeholder")}
            multiline
            value={form.note}
            onChangeText={(v) => setForm((f) => ({ ...f, note: v }))}
          />
          <Button
            disabled={
              createMutation.isPending ||
              !form.sessionId ||
              !form.clientProfileId ||
              !form.note
            }
            onPress={() => createMutation.mutate(form)}
          >
            {t("admin.clients.save")}
          </Button>
          {createMutation.isError ? (
            <ErrorState message={t("trainer.notes.saveError")} />
          ) : null}
        </View>
      </AppSheet>
    </ScreenContainerRaw>
  );
}
