/**
 * ClientPicker — searchable, role-scoped client picker.
 *
 * Two render modes, two selection models:
 *   • Render mode "free"   — server-side search via clientsQueries.list({ q }).
 *                            Used for free-form notes and for the by-client
 *                            filter sheet. Pages on demand; results scope to
 *                            what the server returns (trainers see only
 *                            their own clients).
 *   • Render mode "scoped" — caller passes a fixed `clients` array (e.g. the
 *                            booked clients on a chosen session). No search.
 *
 *   • Selection: pass either `selectedId` + `onSelect` (single) OR
 *                `selectedIds` + `onToggle` (multi). Multi rows render a
 *                checkbox affordance and do not auto-close the parent sheet.
 */
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { Icon } from "@/components/ui/icon";
import { GlassCard } from "./glass-card";
import { Input } from "./input";
import { EmptyState } from "./states";
import { useThemeTokens } from "./tokens";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";
import { useDebouncedValue } from "@/lib/use-debounced-value";

export type ClientPickerItem = {
  id: string;
  user: { id: string; fullName: string; email?: string };
};

type SelectionSingle = {
  selectedId: string | null;
  onSelect: (id: string) => void;
  selectedIds?: never;
  onToggle?: never;
};

type SelectionMulti = {
  selectedIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
  selectedId?: never;
  onSelect?: never;
};

type CommonProps = {
  testID?: string;
  optionTestIDPrefix?: string;
  /**
   * When true, the list renders as a `BottomSheetFlatList` (a gorhom scroll
   * primitive) and drops the inner `maxHeight` so it fills the sheet and
   * scrolls in the sheet's own gesture context. Use ONLY inside an `AppSheet`
   * mounted with `rawContent` + a fixed `snapPoint`. A plain ScrollView with a
   * fixed maxHeight nested in the default AppSheet wrapper breaks gorhom's
   * dynamic sizing (the sheet opens to a sliver or with a huge empty gap).
   */
  bottomSheet?: boolean;
  /** Content rendered above the rows (title, search) when `bottomSheet`. */
  header?: ReactNode;
};

type FreeProps = CommonProps & { mode?: "free" } & (
    | SelectionSingle
    | SelectionMulti
  );

type ScopedProps = CommonProps & {
  mode: "scoped";
  clients: ClientPickerItem[];
  emptyText?: string;
} & (SelectionSingle | SelectionMulti);

export function ClientPicker(props: FreeProps | ScopedProps) {
  if (props.mode === "scoped") {
    return <ScopedPicker {...props} />;
  }
  return <FreePicker {...props} />;
}

function ScopedPicker(props: ScopedProps) {
  const { clients, emptyText, testID, optionTestIDPrefix, bottomSheet, header } = props;
  const { t } = useTranslation();
  const isMulti = "selectedIds" in props && props.selectedIds !== undefined;

  const renderRow = (c: ClientPickerItem) => (
    <ClientRow
      c={c}
      isSelected={isRowSelected(c.id, props)}
      multi={isMulti}
      onPress={() => handleRowPress(c.id, props)}
      testID={optionTestIDPrefix ? `${optionTestIDPrefix}-${c.id}` : undefined}
    />
  );

  // Inside a rawContent sheet: pinned header above a flexed BottomSheetFlatList,
  // matching FreePicker. The scoped roster is short (one class), but this keeps
  // the sheet measurable and the scroll in the sheet's gesture context.
  if (bottomSheet) {
    return (
      <View testID={testID} style={{ flex: 1 }}>
        {header ? (
          <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 12 }}>
            {header}
          </View>
        ) : null}
        <BottomSheetFlatList
          data={clients}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
          renderItem={({ item }) => renderRow(item)}
          ListEmptyComponent={
            <EmptyState title={emptyText ?? t("trainer.notes.emptyClients")} />
          }
        />
      </View>
    );
  }

  return (
    <View testID={testID} style={{ gap: 8 }}>
      <ScrollView
        style={{ maxHeight: 260 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {clients.length === 0 ? (
          <EmptyState title={emptyText ?? t("trainer.notes.emptyClients")} />
        ) : (
          clients.map((c) => <View key={c.id}>{renderRow(c)}</View>)
        )}
      </ScrollView>
    </View>
  );
}

function FreePicker(props: FreeProps) {
  const { testID, optionTestIDPrefix, bottomSheet, header } = props;
  const { t } = useTranslation();
  const isMulti = "selectedIds" in props && props.selectedIds !== undefined;
  const [search, setSearch] = useState("");
  // Debounced so typing fires one search after the pause, not one per letter.
  const deferred = useDebouncedValue(search.trim());

  const query = useInfiniteQuery(
    clientsQueries.list({ q: deferred || undefined, take: 20 }),
  );

  useEffect(() => {
    if (query.hasNextPage && !query.isFetchingNextPage && deferred.length > 0) {
      query.fetchNextPage();
    }
  }, [deferred, query]);

  const clients = useMemo(
    () => query.data?.pages.flatMap((p) => p.clients) ?? [],
    [query.data],
  );

  const searchInput = (
    <Input
      testID={testID ? `${testID}-search-input` : undefined}
      placeholder={t("admin.clients.searchPlaceholder")}
      leftIcon="search"
      value={search}
      onChangeText={setSearch}
      autoCapitalize="none"
      autoCorrect={false}
    />
  );

  const renderRow = (c: ClientPickerItem) => (
    <ClientRow
      c={c}
      isSelected={isRowSelected(c.id, props)}
      multi={isMulti}
      onPress={() => handleRowPress(c.id, props)}
      testID={optionTestIDPrefix ? `${optionTestIDPrefix}-${c.id}` : undefined}
    />
  );

  // Inside a rawContent sheet: a fixed header (title + search) pinned above a
  // BottomSheetFlatList that flexes to fill the rest of the sheet. The list is
  // the sheet's own scroll (gorhom gesture context), so only the rows scroll —
  // the search stays reachable. No inner maxHeight / nested ScrollView.
  if (bottomSheet) {
    return (
      <View testID={testID} style={{ flex: 1 }}>
        <View style={{ gap: 12, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 12 }}>
          {header}
          {searchInput}
        </View>
        <BottomSheetFlatList
          data={clients}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
          renderItem={({ item }) => renderRow(item)}
          ListEmptyComponent={
            query.isLoading ? (
              <View style={{ padding: 24, alignItems: "center" }}>
                <ActivityIndicator />
              </View>
            ) : (
              <EmptyState title={t("trainer.notes.emptyClients")} />
            )
          }
          ListFooterComponent={
            query.isFetchingNextPage ? (
              <View style={{ padding: 12, alignItems: "center" }}>
                <ActivityIndicator />
              </View>
            ) : null
          }
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
          }}
        />
      </View>
    );
  }

  return (
    <View testID={testID} style={{ gap: 12 }}>
      {searchInput}
      <ScrollView
        style={{ maxHeight: 260 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScroll={({ nativeEvent }) => {
          const { contentOffset, layoutMeasurement, contentSize } = nativeEvent;
          const nearBottom =
            contentOffset.y + layoutMeasurement.height >=
            contentSize.height - 80;
          if (
            nearBottom &&
            query.hasNextPage &&
            !query.isFetchingNextPage
          ) {
            query.fetchNextPage();
          }
        }}
        scrollEventThrottle={200}
      >
        {query.isLoading ? (
          <View style={{ padding: 24, alignItems: "center" }}>
            <ActivityIndicator />
          </View>
        ) : clients.length === 0 ? (
          <EmptyState title={t("trainer.notes.emptyClients")} />
        ) : (
          <>
            {clients.map((c) => (
              <View key={c.id}>{renderRow(c)}</View>
            ))}
            {query.isFetchingNextPage ? (
              <View style={{ padding: 12, alignItems: "center" }}>
                <ActivityIndicator />
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function isRowSelected(id: string, props: FreeProps | ScopedProps): boolean {
  if ("selectedIds" in props && props.selectedIds !== undefined) {
    return props.selectedIds.has(id);
  }
  if ("selectedId" in props) {
    return props.selectedId === id;
  }
  return false;
}

function handleRowPress(id: string, props: FreeProps | ScopedProps): void {
  if ("onToggle" in props && props.onToggle !== undefined) {
    props.onToggle(id);
  } else if ("onSelect" in props && props.onSelect !== undefined) {
    props.onSelect(id);
  }
}

function ClientRow({
  c,
  isSelected,
  multi,
  onPress,
  testID,
}: {
  c: ClientPickerItem;
  isSelected: boolean;
  multi: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const tokens = useThemeTokens();
  const initials = c.user.fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole={multi ? "checkbox" : "button"}
      accessibilityState={multi ? { checked: isSelected } : { selected: isSelected }}
      accessibilityLabel={c.user.fullName}
      className="active:opacity-80"
      style={{ marginBottom: 8 }}
    >
      <GlassCard size="sm" accentBorder={isSelected ? "left" : undefined}>
        <View className="flex-row items-center" style={{ gap: 12 }}>
          <View
            className="rounded-full items-center justify-center"
            style={{
              width: 36,
              height: 36,
              backgroundColor: "rgba(46,91,66,0.22)",
            }}
          >
            <Text
              className="font-body-bold"
              style={{ color: "#4caf80", fontSize: 13 }}
            >
              {initials}
            </Text>
          </View>
          <View className="flex-1 flex-col" style={{ gap: 2 }}>
            <Text
              className="font-body-semibold text-foreground"
              style={{ fontSize: 14 }}
              numberOfLines={1}
            >
              {c.user.fullName}
            </Text>
            {c.user.email ? (
              <Text
                className="text-muted"
                style={{ fontSize: 12 }}
                numberOfLines={1}
              >
                {c.user.email}
              </Text>
            ) : null}
          </View>
          {multi ? (
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                borderWidth: 1.5,
                borderColor: isSelected ? tokens.accent : tokens.glassBorder,
                backgroundColor: isSelected ? tokens.accent : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {isSelected ? (
                <Icon name="check" size={14} color={tokens.background} />
              ) : null}
            </View>
          ) : isSelected ? (
            <Icon name="check" size={16} color={tokens.accent} />
          ) : null}
        </View>
      </GlassCard>
    </Pressable>
  );
}
