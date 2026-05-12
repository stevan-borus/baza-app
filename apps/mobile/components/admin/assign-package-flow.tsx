// P4-3: View-agnostic entry into the assign-package flow.
//
// The shared <AssignPackageSheetContent/> from P2-5 needs a `client` prop.
// Both existing consumers (klijenti/index.tsx and klijenti/[id]) already
// know which client they're acting on, so they pass it directly. The new
// Aktivne dodele "+" button doesn't have that context — it's a global view
// across all clients — so this wrapper prepends a two-step picker:
//
//   1. pickClient — search + tap a client row.
//   2. pickMode   — choose "comp" (Pokloni paket) or "paid" (Nova uplata).
//   3. form       — renders <AssignPackageSheetContent/> with the chosen
//                   client + mode. Success closes the whole sheet.
//
// Single AppSheet, internal step machine. Closing the sheet (via the
// backdrop, swipe-down, or onSuccess) resets the flow so the next open
// starts fresh at step "pickClient".

import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Feather from "@expo/vector-icons/Feather";
import { AppSheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { SkeletonCard } from "@/components/ui/skeleton";
import { useThemeTokens } from "@/components/ui/tokens";
import {
  AssignPackageSheetContent,
  type AssignPackageMode,
} from "@/components/admin/assign-package-sheet-content";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";

type PickedClient = {
  id: string;
  user: { id: string; fullName: string; email: string };
};

type Step = "pickClient" | "pickMode" | "form";

export type AssignPackageFlowProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AssignPackageFlow({ open, onOpenChange }: AssignPackageFlowProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>("pickClient");
  const [pickedClient, setPickedClient] = useState<PickedClient | null>(null);
  const [pickedMode, setPickedMode] = useState<AssignPackageMode | null>(null);

  // Reset the flow whenever the sheet closes. Parents control `open`, so we
  // can't move this into onSuccess alone — backdrop tap / swipe-down both
  // route through onOpenChange(false).
  useEffect(() => {
    if (!open) {
      setStep("pickClient");
      setPickedClient(null);
      setPickedMode(null);
    }
  }, [open]);

  return (
    <AppSheet open={open} onOpenChange={onOpenChange}>
      {step === "pickClient" ? (
        <ClientPickerStep
          onPick={(client) => {
            setPickedClient(client);
            setStep("pickMode");
          }}
        />
      ) : null}

      {step === "pickMode" && pickedClient ? (
        <ModePickerStep
          client={pickedClient}
          onBack={() => {
            setPickedClient(null);
            setStep("pickClient");
          }}
          onPick={(mode) => {
            setPickedMode(mode);
            setStep("form");
          }}
        />
      ) : null}

      {step === "form" && pickedClient && pickedMode ? (
        <View className="flex-col gap-4">
          <SheetHeader
            title={
              pickedMode === "paid"
                ? t("admin.clients.newPaymentAction")
                : t("admin.clients.sheetAssign")
            }
            onBack={() => setStep("pickMode")}
          />
          <AssignPackageSheetContent
            client={pickedClient}
            mode={pickedMode}
            onSuccess={() => onOpenChange(false)}
          />
        </View>
      ) : null}
    </AppSheet>
  );
}

// ─── ClientPickerStep ─────────────────────────────────────────────────────
// Mirrors the search + list pattern from klijenti/index.tsx but pared down:
// no filter chips, no segmented control, no actions sheet — just search +
// scrollable rows that resolve on tap.

function ClientPickerStep({
  onPick,
}: {
  onPick: (client: PickedClient) => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  // useDeferredValue batches keystrokes into a single server query. The
  // sheet is a small surface so we keep the page modest and rely on the
  // search to surface clients further down the list. Scrolling to the
  // bottom fetches the next page automatically.
  const deferredSearch = useDeferredValue(search.trim());
  const clientsQuery = useInfiniteQuery(
    clientsQueries.list({ q: deferredSearch || undefined }),
  );
  const filtered = useMemo(
    () => clientsQuery.data?.pages.flatMap((p) => p.clients) ?? [],
    [clientsQuery.data],
  );

  return (
    <View className="flex-col gap-4">
      <Text
        className="text-foreground font-body-bold"
        style={{ fontSize: 20, letterSpacing: -0.3 }}
      >
        {t("admin.izvestaji.paketi.flow.pickClient")}
      </Text>

      <Input
        testID="assign-flow-client-search"
        placeholder={t("admin.izvestaji.paketi.flow.searchPlaceholder")}
        leftIcon="search"
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          if (
            layoutMeasurement.height + contentOffset.y >=
              contentSize.height - 200 &&
            clientsQuery.hasNextPage &&
            !clientsQuery.isFetchingNextPage
          ) {
            clientsQuery.fetchNextPage();
          }
        }}
        scrollEventThrottle={400}
      >
        {clientsQuery.isError ? (
          <ErrorState message={t("admin.clients.error")} />
        ) : null}

        {clientsQuery.isLoading && filtered.length === 0 ? (
          <View style={{ gap: 8 }}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : null}

        {!clientsQuery.isLoading && !clientsQuery.isError && filtered.length === 0 ? (
          <EmptyState
            title={
              deferredSearch.length > 0
                ? t("admin.clients.filterEmpty")
                : t("admin.clients.empty")
            }
          />
        ) : null}

        <View>
          {filtered.map((c, idx) => (
            <React.Fragment key={c.id}>
              {idx > 0 ? (
                <View
                  className="bg-glass-border"
                  style={{ height: 1, marginLeft: 52 }}
                />
              ) : null}
              <Pressable
                testID={`assign-flow-client-row-${c.user.id}`}
                onPress={() =>
                  onPick({
                    id: c.id,
                    user: {
                      id: c.user.id,
                      fullName: c.user.fullName,
                      email: c.user.email,
                    },
                  })
                }
                android_ripple={null}
                className="flex-row items-center gap-3 py-3 active:opacity-70"
              >
                <PickerAvatar name={c.user.fullName} />
                <View className="flex-1 gap-0.5">
                  <Text
                    className="text-foreground font-body-semibold"
                    style={{ fontSize: 15 }}
                    numberOfLines={1}
                  >
                    {c.user.fullName}
                  </Text>
                  <Text
                    className="text-muted"
                    style={{ fontSize: 12 }}
                    numberOfLines={1}
                  >
                    {c.user.email}
                  </Text>
                </View>
              </Pressable>
            </React.Fragment>
          ))}
        </View>
        {clientsQuery.isFetchingNextPage ? (
          <ActivityIndicator style={{ padding: 16 }} />
        ) : null}
      </ScrollView>
    </View>
  );
}

// ─── ModePickerStep ───────────────────────────────────────────────────────
// Two big buttons. The choice between "comp" and "paid" is consequential
// (one creates a billing record, the other doesn't) — it deserves a beat.

function ModePickerStep({
  client,
  onBack,
  onPick,
}: {
  client: PickedClient;
  onBack: () => void;
  onPick: (mode: AssignPackageMode) => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="flex-col gap-4">
      <SheetHeader
        title={t("admin.izvestaji.paketi.flow.pickMode")}
        onBack={onBack}
      />
      <View className="flex-row items-center gap-3 pb-1">
        <PickerAvatar name={client.user.fullName} />
        <View className="flex-1 gap-0.5">
          <Text
            className="text-foreground font-body-semibold"
            style={{ fontSize: 16 }}
            numberOfLines={1}
          >
            {client.user.fullName}
          </Text>
          <Text
            className="text-muted"
            style={{ fontSize: 12 }}
            numberOfLines={1}
          >
            {client.user.email}
          </Text>
        </View>
      </View>

      <Button
        testID="assign-flow-mode-comp"
        size="large"
        variant="secondary"
        onPress={() => onPick("comp")}
      >
        {t("admin.izvestaji.paketi.flow.modeComp")}
      </Button>
      <Button
        testID="assign-flow-mode-paid"
        size="large"
        onPress={() => onPick("paid")}
      >
        {t("admin.izvestaji.paketi.flow.modePaid")}
      </Button>
    </View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function PickerAvatar({ name }: { name: string }) {
  const initials = (name ?? "??")
    .split(" ")
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return (
    <View className="items-center justify-center w-10 h-10 rounded-full bg-accent-soft">
      <Text className="text-accent font-body-bold" style={{ fontSize: 13 }}>
        {initials}
      </Text>
    </View>
  );
}

function SheetHeader({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  const tokens = useThemeTokens();
  return (
    <View className="flex-row items-center gap-2 -ml-1">
      <Pressable
        onPress={onBack}
        hitSlop={12}
        android_ripple={null}
        className="active:opacity-60 w-8 h-8 items-center justify-center"
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Feather name="chevron-left" size={22} color={tokens.foreground} />
      </Pressable>
      <Text
        className="text-foreground font-body-bold flex-1"
        style={{ fontSize: 20, letterSpacing: -0.3 }}
      >
        {title}
      </Text>
    </View>
  );
}
