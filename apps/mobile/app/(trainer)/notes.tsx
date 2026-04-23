/**
 * Trainer Notes screen — filter chips (All / This week / By client), GlassCard note rows,
 * infinite scroll, FAB to open compose sheet.
 * Motion: MotiView stagger on title (0ms) → chips (80ms) → list (160ms).
 */

import { useState, useMemo } from "react";
import { useMutation, useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { MotiView } from "@/components/ui/styled";
import { LegendList } from "@legendapp/list";
import { AppSheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { ScreenContainerRaw } from "@/components/ui/screen-container";
import { ScreenTitle, SectionLabel } from "@/components/ui/typography";
import { getDateLocale } from "@/lib/i18n";
import { trainerNotesQueries, type TrainerNote } from "@/lib/queries/trainer-notes-queries-factory";
import { sessionsQueries } from "@/lib/queries/sessions-queries-factory";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";

// ─── types ───────────────────────────────────────────────────────────────────

type FilterValue = "all" | "thisWeek" | "byClient";

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

function applyFilter(notes: TrainerNote[], filter: FilterValue): TrainerNote[] {
  if (filter === "thisWeek") {
    const weekStart = startOfWeek().getTime();
    return notes.filter((n) => new Date(n.createdAt).getTime() >= weekStart);
  }
  if (filter === "byClient") {
    // Stable sort by client full name, then by createdAt desc within each client.
    return [...notes].sort((a, b) => {
      const aName = a.clientProfile?.user.fullName ?? "";
      const bName = b.clientProfile?.user.fullName ?? "";
      if (aName !== bName) return aName.localeCompare(bName);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }
  return notes;
}

// ─── FilterChip ──────────────────────────────────────────────────────────────

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? "#4caf80" : "rgba(255,255,255,0.12)",
        backgroundColor: active ? "rgba(46,91,66,0.30)" : "rgba(255,255,255,0.05)",
      }}
    >
      <Text
        style={{
          fontSize: 13,
          fontWeight: active ? "600" : "400",
          color: active ? "#4caf80" : "rgba(255,255,255,0.55)",
          letterSpacing: 0.1,
        }}
      >
        {label}
      </Text>
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
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ sessionId: "", clientProfileId: "", note: "" });
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterValue>("all");
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
  const filteredNotes = useMemo(() => applyFilter(allNotes, filter), [allNotes, filter]);

  // For "By client" grouping we interleave sticky section headers with note rows.
  type ListItem =
    | { kind: "header"; clientName: string; id: string }
    | { kind: "row"; note: TrainerNote; id: string };

  const { listData, stickyIndices } = useMemo<{
    listData: ListItem[];
    stickyIndices: number[];
  }>(() => {
    if (filter !== "byClient") {
      return {
        listData: filteredNotes.map((n) => ({
          kind: "row" as const,
          note: n,
          id: n.id,
        })),
        stickyIndices: [],
      };
    }

    const items: ListItem[] = [];
    const stickies: number[] = [];
    let lastClient: string | null = null;
    for (const note of filteredNotes) {
      const name =
        note.clientProfile?.user.fullName ?? t("trainer.notes.unknownClient");
      if (name !== lastClient) {
        stickies.push(items.length);
        items.push({ kind: "header", clientName: name, id: `h:${name}` });
        lastClient = name;
      }
      items.push({ kind: "row", note, id: note.id });
    }
    return { listData: items, stickyIndices: stickies };
  }, [filteredNotes, filter, t]);

  async function handleRefresh() {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["trainer-notes"] });
    setRefreshing(false);
  }

  function handleEndReached() {
    if (notesQuery.hasNextPage && !notesQuery.isFetchingNextPage) notesQuery.fetchNextPage();
  }

  const chips: { value: FilterValue; label: string }[] = [
    { value: "all", label: t("trainer.notes.filterAll") },
    { value: "thisWeek", label: t("trainer.notes.filterThisWeek") },
    { value: "byClient", label: t("trainer.notes.filterByClient") },
  ];

  return (
    <ScreenContainerRaw>
      {/* ── Header row ── */}
      <MotiView
        from={{ opacity: 0, translateY: -8 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 400, delay: 0 }}
        style={{ paddingHorizontal: 20, paddingBottom: 4, paddingTop: 4 }}
      >
        <ScreenTitle>{t("trainer.notes.title")}</ScreenTitle>
      </MotiView>

      {/* ── Filter chips ── */}
      <MotiView
        from={{ opacity: 0, translateY: 6 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 380, delay: 80 }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8, flexDirection: "row" }}
          style={{ flexGrow: 0 }}
        >
          {chips.map((chip) => (
            <FilterChip
              key={chip.value}
              label={chip.label}
              active={filter === chip.value}
              onPress={() => setFilter(chip.value)}
            />
          ))}
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
          stickyIndices={stickyIndices}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#2e5b42"
              colors={["#2e5b42"]}
            />
          }
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 100 }}
          renderItem={({ item }: { item: ListItem }) =>
            item.kind === "header" ? (
              <View
                style={{
                  backgroundColor: "rgba(10,15,20,0.92)",
                  paddingVertical: 8,
                  marginBottom: 4,
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    letterSpacing: 0.8,
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.55)",
                  }}
                >
                  {item.clientName}
                </Text>
              </View>
            ) : (
              <NoteRow item={item.note} dateLocale={dateLocale} />
            )
          }
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

      {/* ── FAB ── */}
      <View
        style={{
          position: "absolute",
          bottom: 24,
          right: 20,
          zIndex: 10,
        }}
      >
        <Pressable
          onPress={() => setShowCreate(true)}
          accessibilityRole="button"
          accessibilityLabel={t("trainer.notes.newNote")}
          style={({ pressed }) => ({
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: pressed ? "#3a9e6e" : "#4caf80",
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#4caf80",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.4,
            shadowRadius: 12,
            elevation: 8,
          })}
        >
          <Text style={{ color: "#fff", fontSize: 28, lineHeight: 32, fontWeight: "300" }}>+</Text>
        </Pressable>
      </View>

      {/* ── Compose sheet (preserved) ── */}
      <AppSheet open={showCreate} onOpenChange={setShowCreate}>
        <View className="flex-col gap-5">
          <Text
            className="text-foreground font-bold"
            style={{ fontSize: 24, letterSpacing: -0.3 }}
          >
            {t("trainer.notes.sheetTitle")}
          </Text>

          <SectionLabel>{t("trainer.notes.session")}</SectionLabel>
          {(sessionsQuery.data?.sessions ?? []).slice(0, 10).map((s) => (
            <Button
              key={s.id}
              size="small"
              variant={form.sessionId === s.id ? "primary" : "secondary"}
              onPress={() => setForm((f) => ({ ...f, sessionId: s.id }))}
            >
              {s.classType?.name ?? t("trainer.clients.sessionName")} -{" "}
              {new Date(s.startsAt).toLocaleDateString(dateLocale)}
            </Button>
          ))}

          <SectionLabel>{t("trainer.notes.client")}</SectionLabel>
          {(clientsQuery.data?.clients ?? []).map((c) => (
            <Button
              key={c.id}
              size="small"
              variant={form.clientProfileId === c.id ? "primary" : "secondary"}
              onPress={() => setForm((f) => ({ ...f, clientProfileId: c.id }))}
            >
              {c.user.fullName}
            </Button>
          ))}

          <Input
            placeholder={t("trainer.notes.placeholder")}
            multiline
            numberOfLines={3}
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
