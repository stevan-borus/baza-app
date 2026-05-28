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
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { GlassCard } from "./glass-card";
import { Input } from "./input";
import { EmptyState } from "./states";
import { useThemeTokens } from "./tokens";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";

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
  const { clients, emptyText, testID, optionTestIDPrefix } = props;
  const { t } = useTranslation();
  const isMulti = "selectedIds" in props && props.selectedIds !== undefined;

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
          clients.map((c) => (
            <ClientRow
              key={c.id}
              c={c}
              isSelected={isRowSelected(c.id, props)}
              multi={isMulti}
              onPress={() => handleRowPress(c.id, props)}
              testID={
                optionTestIDPrefix
                  ? `${optionTestIDPrefix}-${c.id}`
                  : undefined
              }
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function FreePicker(props: FreeProps) {
  const { testID, optionTestIDPrefix } = props;
  const { t } = useTranslation();
  const isMulti = "selectedIds" in props && props.selectedIds !== undefined;
  const [search, setSearch] = useState("");
  const deferred = useDeferredValue(search.trim());

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

  return (
    <View testID={testID} style={{ gap: 12 }}>
      <Input
        testID={testID ? `${testID}-search-input` : undefined}
        placeholder={t("admin.clients.searchPlaceholder")}
        leftIcon="search"
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        autoCorrect={false}
      />
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
              <ClientRow
                key={c.id}
                c={c}
                isSelected={isRowSelected(c.id, props)}
                multi={isMulti}
                onPress={() => handleRowPress(c.id, props)}
                testID={
                  optionTestIDPrefix
                    ? `${optionTestIDPrefix}-${c.id}`
                    : undefined
                }
              />
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
                <Feather name="check" size={14} color={tokens.background} />
              ) : null}
            </View>
          ) : isSelected ? (
            <Feather name="check" size={16} color={tokens.accent} />
          ) : null}
        </View>
      </GlassCard>
    </Pressable>
  );
}
