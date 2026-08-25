/**
 * Shared TrainerNotes feed — filter chips (All / This week / By client /
 * By session), GlassCard note rows, infinite scroll, header "+" that opens
 * the shared compose sheet, tap-to-edit, delete confirm.
 *
 * `audience` parameterizes the four behaviors that differ between the trainer
 * and admin views — see the table below. Everything else is identical.
 *
 * | behavior          | trainer                  | admin                          |
 * |-------------------|--------------------------|--------------------------------|
 * | list contents     | own notes (server scope) | all notes (server scope)       |
 * | client name row   | shown                    | shown (spans clients)          |
 * | edit affordance   | always                   | only notes the admin authored  |
 * | delete affordance | own notes                | any note (moderation)          |
 *
 * The list-contents difference needs no client code: the GET endpoint scopes
 * by the caller's role. Edit-own is a UI branch on `note.trainer.id === me.id`
 * AND is enforced on the server (PATCH is authorship-bound for every role).
 */

import { useState, useMemo, useCallback, useRef } from "react";
import { useMutation, useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { Icon, type IconName } from "@/components/ui/icon";
import { MotiView } from "@/components/ui/styled";
import { LegendList, type LegendListRef } from "@legendapp/list/react-native";
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
import { authQueries } from "@/lib/queries/auth-queries-factory";
import { TrainerNoteComposeSheet } from "@/components/shared/trainer-note-compose-sheet";
import { canEditNote, type NotesAudience } from "@/components/shared/notes-edit-policy";
import { formatMutationError } from "@/lib/admin/format-mutation-error";

export type { NotesAudience };

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Serbian count plurals: 1 → singular, 2-4 → paucal, 5+ → plural.
 * Numbers ending 11-14 take the plural form regardless of last digit.
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
            <Text className="text-muted font-body-medium" style={{ fontSize: 13 }}>
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
          <Icon name="x" size={20} color={tokens.muted} />
        </Pressable>
      </View>
    </View>
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
  trailingIcon?: IconName;
  onPress: () => void;
  onTrailingIconPress?: () => void;
}) {
  const tokens = useThemeTokens();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      aria-pressed={active}
      android_ripple={null}
      className={`flex-row items-center px-3.5 py-2 rounded-full border active:opacity-80 ${
        active ? "bg-foreground border-foreground" : "border-glass-border"
      }`}
      style={{ gap: 6 }}
    >
      <Text
        className={active ? "text-background font-body-semibold" : "text-muted font-body-medium"}
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
            <Icon
              name={trailingIcon}
              size={trailingIcon === "times" ? 11 : 9}
              color={active ? tokens.background : tokens.faint}
            />
          </Pressable>
        ) : (
          <Icon
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
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
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

// ─── NotesFeed ───────────────────────────────────────────────────────────────

export function NotesFeed({
  audience,
  leftSlot,
  headerVariant = "tab",
}: {
  audience: NotesAudience;
  /** Optional header left slot — admin tabs pass the UserAvatar here. */
  leftSlot?: React.ReactNode;
  /** "tab" for a tab destination, "detail" for a pushed screen (back button). */
  headerVariant?: "tab" | "detail";
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "sr";
  const queryClient = useQueryClient();
  const bottomPad = useTabBarBottomPadding();
  const listRef = useRef<LegendListRef>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedClientIds, setSelectedClientIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [selectedClientNames, setSelectedClientNames] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [selectedSessionIds, setSelectedSessionIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [editingNote, setEditingNote] = useState<TrainerNote | null>(null);
  const [editText, setEditText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dateLocale = getDateLocale();

  // Viewer id — used by the admin feed to decide whether a note is editable.
  // The trainer feed only ever sees its own notes, so the check is moot there.
  const meQuery = useQuery(authQueries.me());
  const myUserId = meQuery.data?.user.id ?? null;

  const notesQuery = useInfiniteQuery(
    trainerNotesQueries.listInfinite({
      clientProfileIds:
        selectedClientIds.size > 0 ? Array.from(selectedClientIds) : undefined,
      sessionIds: selectedSessionIds.size > 0 ? Array.from(selectedSessionIds) : undefined,
    }),
  );
  const sessionsQuery = useQuery(sessionsQueries.list());

  const updateMutation = useMutation({
    ...trainerNotesQueries.update(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: trainerNotesQueries.all });
      setEditingNote(null);
    },
  });

  const deleteMutation = useMutation({
    ...trainerNotesQueries.delete(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: trainerNotesQueries.all });
      setConfirmDelete(false);
      setEditingNote(null);
    },
  });

  function openEdit(note: TrainerNote) {
    setEditText(note.note);
    setEditingNote(note);
  }

  const canEditEditing = canEditNote(audience, editingNote, myUserId);

  const allNotes = notesQuery.data?.pages.flatMap((p) => p.notes) ?? [];

  type ListItem = { kind: "row"; note: TrainerNote; id: string };

  const listData: ListItem[] = allNotes.map((n) => ({
    kind: "row" as const,
    note: n,
    id: n.id,
  }));

  async function handleRefresh() {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: trainerNotesQueries.all });
    setRefreshing(false);
  }

  function handleEndReached() {
    if (notesQuery.hasNextPage && !notesQuery.isFetchingNextPage) notesQuery.fetchNextPage();
  }

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

  const toggleClientId = useCallback(
    (id: string) => {
      setSelectedClientIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setSelectedClientNames((prev) => {
        const cached = queryClient.getQueryData<{
          pages: { clients: { id: string; user: { fullName: string } }[] }[];
        }>(["clients", "list", { q: "", take: 20 }]);
        const found = cached?.pages.flatMap((p) => p.clients).find((c) => c.id === id);
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

  const title = audience === "admin" ? t("admin.notes.title") : t("tabs.notes");
  const newNoteLabel =
    audience === "admin" ? t("admin.notes.newNote") : t("trainer.notes.newNote");

  return (
    <ScreenContainerRaw
      title={title}
      headerVariant={headerVariant}
      leftSlot={leftSlot}
      rightSlot={
        <HeaderIconButton
          icon="plus"
          onPress={() => setShowCreate(true)}
          accessibilityLabel={newNoteLabel}
          testID={audience === "admin" ? "admin-new-note-button" : "trainer-new-note-button"}
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
            label={clientChipLabel}
            active={selectedClientIds.size > 0}
            trailingIcon={selectedClientIds.size > 0 ? "times" : "chevron-down"}
            onPress={() => setShowClientPicker(true)}
            onTrailingIconPress={selectedClientIds.size > 0 ? clearClientFilter : undefined}
          />
          <View testID="note-filter-by-session">
            <FilterChip
              label={sessionChipLabel}
              active={selectedSessionIds.size > 0}
              trailingIcon={selectedSessionIds.size > 0 ? "times" : "chevron-down"}
              onPress={() => setShowSessionPicker(true)}
              onTrailingIconPress={selectedSessionIds.size > 0 ? clearSessionFilter : undefined}
            />
          </View>
        </ScrollView>
      </MotiView>

      {/* ── Error state ── */}
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
          ref={listRef}
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
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottomPad }}
          // Top gap lives in a header spacer, NOT contentContainerStyle.paddingTop:
          // LegendList offsets its initial scroll position by container paddingTop
          // on a fresh mount, leaving the first row clipped ~16px until you scroll.
          // A ListHeaderComponent is counted as content, so the offset is correct.
          ListHeaderComponent={<View style={{ height: 16 }} />}
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
            !notesQuery.isLoading ? <EmptyState title={t("trainer.notes.empty")} /> : null
          }
          ListFooterComponent={
            notesQuery.isFetchingNextPage ? <ActivityIndicator style={{ padding: 16 }} /> : null
          }
          estimatedItemSize={80}
        />
      </MotiView>

      {/* ── Client filter sheet (multi-select) ──
          rawContent + fixed snapPoint: the picker's BottomSheetFlatList is the
          sheet's own scroll, so a long client list scrolls cleanly. Matches the
          reservation-mode pattern; the default dynamic-sized AppSheet can't
          measure a nested fixed-height list (sheet opens to a sliver / gap). */}
      <AppSheet
        open={showClientPicker}
        onOpenChange={setShowClientPicker}
        rawContent
        snapPoints={["85%"]}
      >
        <ClientPicker
          testID="client-filter-picker"
          optionTestIDPrefix="client-filter-option"
          selectedIds={selectedClientIds}
          onToggle={toggleClientId}
          bottomSheet
          header={
            <FilterSheetHeader
              title={t("trainer.notes.pickClientTitle")}
              count={selectedClientIds.size}
              onClear={clearClientFilter}
              onDone={() => setShowClientPicker(false)}
            />
          }
        />
      </AppSheet>

      {/* ── Compose sheet (shared) ── */}
      <TrainerNoteComposeSheet
        open={showCreate}
        onOpenChange={setShowCreate}
        clientProfileId={null}
        onCreated={() => {
          requestAnimationFrame(() => {
            listRef.current?.scrollToOffset({ offset: 0, animated: true });
          });
        }}
      />

      {/* ── Session filter sheet (multi-select) ── */}
      <AppSheet
        open={showSessionPicker}
        onOpenChange={setShowSessionPicker}
        rawContent
        snapPoints={["85%"]}
      >
        <SessionPicker
          testID="session-filter-picker"
          optionTestIDPrefix="session-filter-option"
          sessions={sessionsQuery.data?.sessions ?? []}
          selectedIds={selectedSessionIds}
          onToggle={toggleSessionId}
          bottomSheet
          header={
            <FilterSheetHeader
              title={t("trainer.notes.pickSessionTitle")}
              count={selectedSessionIds.size}
              onClear={clearSessionFilter}
              onDone={() => setShowSessionPicker(false)}
            />
          }
        />
      </AppSheet>

      {/* ── Edit note sheet ──
          For the admin feed, a note authored by someone else is read-only:
          the body shows as static text and only Delete is offered. The
          PATCH endpoint also enforces this, so the read-only view is the
          friendly half of a defense-in-depth pair. */}
      <AppSheet
        open={!!editingNote}
        onOpenChange={(v) => !v && setEditingNote(null)}
        stackBehavior="push"
      >
        <View className="flex-col gap-4 pb-5">
          <Text
            className="text-foreground font-body-bold"
            style={{ fontSize: 20, letterSpacing: -0.3 }}
          >
            {canEditEditing
              ? t("trainer.notes.editSheetTitle")
              : t("admin.notes.viewSheetTitle")}
          </Text>
          {canEditEditing ? (
            <Input
              testID="note-edit-text-input"
              placeholder={t("trainer.notes.placeholder")}
              multiline
              value={editText}
              onChangeText={setEditText}
            />
          ) : (
            <>
              <Text
                testID="note-readonly-body"
                className="text-foreground"
                style={{ fontSize: 14, lineHeight: 20 }}
              >
                {editingNote?.note}
              </Text>
              {editingNote?.trainer ? (
                <Text className="text-muted" style={{ fontSize: 12 }}>
                  {t("admin.notes.authoredBy", { name: editingNote.trainer.fullName })}
                </Text>
              ) : null}
            </>
          )}
          {canEditEditing ? (
            <Button
              testID="note-edit-save-button"
              disabled={updateMutation.isPending || !editText.trim()}
              onPress={() => {
                if (!editingNote) return;
                updateMutation.mutate({ id: editingNote.id, note: editText.trim() });
              }}
            >
              {t("admin.schedule.saveChanges")}
            </Button>
          ) : null}
          <Button
            testID="note-edit-delete-button"
            variant="danger"
            disabled={deleteMutation.isPending || !editingNote}
            onPress={() => setConfirmDelete(true)}
          >
            {t("confirm.deleteNoteConfirm")}
          </Button>
          {updateMutation.isError ? (
            <ErrorState
              message={formatMutationError(
                updateMutation.error,
                t,
                lang,
                t("trainer.notes.saveError"),
              )}
            />
          ) : null}
        </View>
      </AppSheet>
      <ConfirmSheet
        stackBehavior="push"
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("confirm.deleteNoteTitle")}
        message={t("confirm.deleteNoteMessage")}
        confirmLabel={t("confirm.deleteNoteConfirm")}
        loading={deleteMutation.isPending}
        testID="note-delete-confirm-button"
        errorMessage={
          deleteMutation.isError
            ? formatMutationError(
                deleteMutation.error,
                t,
                lang,
                t("trainer.notes.saveError"),
              )
            : null
        }
        onConfirm={() => {
          if (!editingNote) return;
          deleteMutation.mutate(editingNote.id);
        }}
      />
    </ScreenContainerRaw>
  );
}
