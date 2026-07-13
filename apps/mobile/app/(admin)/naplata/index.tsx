/**
 * Design references (from docs/inspiration/):
 * - Stripe Dashboard ios Jun 2023/ — period selector, hero revenue, transaction list detail
 *
 * Migration note: the billing list is rendered through `<PaginatedList>` and
 * the period selector + hero + StatStrip + per-client filter live in a fixed
 * View ABOVE the list so they no longer drift off-screen as the user scrolls.
 *
 * PR β trim (2026-05-12): the status filter chip strip (Sve / Potvrđen /
 * Na čekanju / Otkazan) is gone — the studio doesn't run a payment-
 * confirmation workflow, so PENDING and CANCELED rows never existed in
 * practice and the chips for them just produced empty lists. List rows
 * also moved from GlassCard chrome to a hairline-row pattern that triples
 * on-screen density (matches Klijenti's row style).
 *
 * Hidden search input: a `testID="naplata-search-input"` Input is mounted
 * in the sticky header purely as the e2e anchor for the sticky-header spec.
 * It also serves as a natural client-side filter over the loaded pages
 * (matches client.fullName / notes), same trade-off documented in the
 * Klijenti and ActiveAssignments migrations.
 */
import { useState, useMemo } from "react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { router } from "expo-router";
import dayjs from "dayjs";
import { ReturnToPill } from "@/components/admin/return-to-pill";
import { useDrillWindow, type DrillWindow } from "@/lib/admin/drill";
import { MotiView } from "@/components/ui/styled";
import { getDateLocale } from "@/lib/i18n";
import { formatRsd } from "@/lib/format";
import { RAW_METHOD_LABEL_KEYS } from "@/lib/payment-method-labels";
import { AppSheet } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/card";
import { NumberRollup } from "@/components/ui/number-rollup";
import { CapsLabel, StatStrip } from "@/components/ui/studio";
import { useThemeTokens } from "@/components/ui/tokens";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PaginatedList } from "@/components/ui/paginated-list";
import { SkeletonList } from "@/components/ui/skeleton";
import { packagesQueries } from "@/lib/queries/packages-queries-factory";
import {
  billingQueries,
  useCreateBillingMutation,
  useConfirmBillingMutation,
  type BillingRecord,
} from "@/lib/queries/billing-queries-factory";
import { clientsQueries } from "@/lib/queries/clients-queries-factory";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { ScreenContainerRaw, useTabBarBottomPadding } from "@/components/ui/screen-container";
import { HeaderIconButton } from "@/components/ui/app-header";
import { AdminTabLeftSlot } from "@/components/admin/admin-tab-left-slot";

/**
 * Period-selector label while a cross-tab drill window is active. Mirrors
 * the range-label convention on the Izveštaji sub-pages: inclusive end,
 * year only shown when the range crosses a year boundary.
 */
function drillRangeLabel(window: DrillWindow, dateLocale: string): string {
  const fromD = new Date(window.from);
  // `to` is an exclusive upper bound — display the last included instant.
  const inclusiveTo = new Date(new Date(window.to).getTime() - 1);
  const crossesYear = fromD.getUTCFullYear() !== inclusiveTo.getUTCFullYear();
  const fmt: Intl.DateTimeFormatOptions = crossesYear
    ? { day: "numeric", month: "short", year: "numeric" }
    : { day: "numeric", month: "short" };
  return `${fromD.toLocaleDateString(dateLocale, fmt)} – ${inclusiveTo.toLocaleDateString(dateLocale, fmt)}`;
}

export default function AdminBilling() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "sr";
  const tokens = useThemeTokens();
  const bottomPad = useTabBarBottomPadding();
  const [showCreate, setShowCreate] = useState(false);
  // Stacked client-picker sheet over the create-payment sheet — replaces the
  // old inline Select that listed every client. Server-side search +
  // pagination via ClientPicker means we no longer eagerly drain all pages.
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => dayjs());
  const [searchQuery, setSearchQuery] = useState("");
  const [form, setForm] = useState({
    clientUserId: "",
    clientName: "",
    amount: "",
    method: "CASH",
    notes: "",
    packageTypeId: "",
  });

  // Cross-tab drill window (ADR-0005) — when Prihod drills into a chart
  // bucket it sends `from`/`to`; we pre-filter to that window. No (valid)
  // drill params → fall back to the screen's own selected month.
  const drillWindow = useDrillWindow();
  const monthFrom = selectedMonth.startOf("month").toISOString();
  const monthTo = selectedMonth.endOf("month").toISOString();
  // Search now runs in Postgres (matches client name / notes), so it feeds the
  // list AND the summary. Debounced so a keystroke burst fires ONE request pair
  // after the user pauses, not one list + one summary request per letter.
  const deferredSearch = useDebouncedValue(searchQuery.trim());
  const billingFilters = {
    from: drillWindow?.from ?? monthFrom,
    to: drillWindow?.to ?? monthTo,
    q: deferredSearch || undefined,
  };
  const billingQuery = useInfiniteQuery(
    billingQueries.listInfinite(billingFilters),
  );
  // Filter-wide totals for the hero + StatStrip. Spans the whole month (or the
  // whole search), not the loaded pages — the old summed-in-memory stats
  // understated every figure until the admin scrolled.
  const summaryQuery = useQuery(billingQueries.summary(billingFilters));
  // The create-payment client is now chosen via a stacked ClientPicker sheet
  // (server search + pagination), so we no longer eagerly drain every client
  // page here. (The list's per-client filtering works off the loaded billing
  // records, not a client roster.)
  const packageTypesQuery = useQuery(packagesQueries.types());
  const records = useMemo(
    () => billingQuery.data?.pages.flatMap((p) => p.records) ?? [],
    [billingQuery.data],
  );

  // Hero + StatStrip totals come from the server summary (filter-wide), not a
  // sum over loaded pages. `avg` keeps its per-client meaning (matching the
  // "Avg per client" label): totalRevenue / distinctClients.
  //
  // Revenue integrity under pay-later: PENDING (not yet money) and VOIDED
  // (revoked) rows stay visible in the list — they carry a loud "Nije
  // plaćeno" / "Stornirano" badge the studio scans for — but must never
  // count as revenue. The summary endpoint enforces `status: "CONFIRMED"`
  // server-side (see server/routes/billing/summary.ts), so these totals are
  // both filter-wide AND already exclude PENDING/VOIDED. That server filter
  // replaces the old client-side `records.filter(r => r.status === ...)`.
  const summaryStats = {
    totalRevenue: summaryQuery.data?.totalRevenue ?? 0,
    count: summaryQuery.data?.count ?? 0,
    avg:
      summaryQuery.data && summaryQuery.data.distinctClients > 0
        ? Math.round(
            summaryQuery.data.totalRevenue / summaryQuery.data.distinctClients,
          )
        : 0,
  };

  // The list is server-filtered now (the search runs in Postgres and feeds
  // both the list and the summary), so the visible rows already reflect the
  // search — no client-side narrowing needed. The list endpoint returns ALL
  // statuses (buildBillingWhere has no status constraint), so PENDING/VOIDED
  // rows show here with their badges even though the summary excludes them.
  const filteredRecords = records;

  // Filtered-totals subtitle (P4-2). "Filters active" means the user has
  // typed a search; the month chooser always has a value so from/to isn't a
  // "filter" for this cue. Count + amount come from the summary, so they're
  // filter-wide (accurate under search) AND CONFIRMED-only, not a loaded-
  // pages tally.
  const filtersActive = deferredSearch !== "";
  const filteredCount = summaryStats.count;
  const filteredAmount = summaryStats.totalRevenue;

  function navigateBillingMonth(direction: -1 | 1) {
    if (drillWindow) {
      // Stepping the chooser exits the drill window — clear the drill
      // params (the destination owns clearing its own state, ADR-0005) and
      // resume month mode anchored to the drilled range's start.
      router.setParams({ from: undefined, to: undefined });
      setSelectedMonth(
        dayjs(drillWindow.from).startOf("month").add(direction, "month"),
      );
      return;
    }
    setSelectedMonth((m) => m.add(direction, "month"));
  }

  // Cache upkeep (billing + reports revenue + packages/clients when a package
  // activates) is baked into the factory hook; the sheet-close side-effects
  // are passed per-call via mutate(vars, { onSuccess }).
  const createMutation = useCreateBillingMutation();

  // Confirm-payment sheet for pay-later (PENDING) rows: tapping such a row
  // opens it; the method can be corrected at confirm time (promised cash,
  // paid by card).
  const [confirmTarget, setConfirmTarget] = useState<BillingRecord | null>(null);
  const [confirmMethod, setConfirmMethod] = useState("CASH");
  const confirmMutation = useConfirmBillingMutation();

  const methodLabelKeys = RAW_METHOD_LABEL_KEYS;
  const methods = ["CASH", "CARD", "COMPANY", "MANUAL_ONLINE"] as const;
  const dateLocale = getDateLocale();

  const periodLabel = drillWindow
    ? drillRangeLabel(drillWindow, dateLocale)
    : selectedMonth.locale(lang).format("MMMM YYYY");

  return (
    <ScreenContainerRaw
      title={t("tabs.billing")}
      leftSlot={<AdminTabLeftSlot />}
      rightSlot={
        <HeaderIconButton
          icon="plus"
          onPress={() => setShowCreate(true)}
          accessibilityLabel={t("admin.manage.sheetNewPayment")}
        />
      }
    >
      <View style={{ flex: 1 }}>
        {/* ── Sticky header ──────────────────────────────────────────────────
            Lives OUTSIDE the list so the period selector, hero revenue,
            StatStrip, search input, and per-client filter stay pinned
            while rows scroll underneath. The MotiView entry animations
            are preserved — they only run once on mount, not on every list
            scroll.

            PR β: paddingTop/Bottom tightened (16 → 8) on the period
            selector wrapper to bring the hero higher up the viewport. */}
        <View
          style={{
            paddingTop: 8,
            paddingHorizontal: 24,
            paddingBottom: 8,
            gap: 16,
          }}
        >
          {/* Return-to pill — only when arriving from a cross-tab drill */}
          <ReturnToPill testID="naplata-return-to-pill" />

          {/* Period selector — caps label between Feather chevrons */}
          <MotiView
            from={{ opacity: 0, translateY: -8 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 350, delay: 0 }}
          >
            <View className="flex-row justify-between items-center">
              <Pressable
                onPress={() => navigateBillingMonth(-1)}
                hitSlop={12}
                android_ripple={null}
                className="active:opacity-60 w-9 h-9 items-center justify-center"
              >
                <Icon name="chevron-left" size={20} color={tokens.foreground} />
              </Pressable>
              <CapsLabel size={11} tracking={1.6}>
                {periodLabel}
              </CapsLabel>
              <Pressable
                onPress={() => navigateBillingMonth(1)}
                hitSlop={12}
                android_ripple={null}
                className="active:opacity-60 w-9 h-9 items-center justify-center"
              >
                <Icon name="chevron-right" size={20} color={tokens.foreground} />
              </Pressable>
            </View>
          </MotiView>

          {/* Total revenue — editorial overline + giant numeral */}
          <MotiView
            from={{ opacity: 0, translateY: 12 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 350, delay: 80 }}
          >
            <View className="gap-1.5">
              <CapsLabel size={11} tracking={1.6} className="text-muted">
                {t("admin.manage.totalRevenue")}
              </CapsLabel>
              <View className="flex-row items-baseline">
                <NumberRollup
                  value={summaryStats.totalRevenue}
                  formatter={(n) =>
                    `${Math.round(n).toLocaleString("sr-RS")}`
                  }
                  className="text-foreground font-body-bold"
                  style={{ fontSize: 40, letterSpacing: -1, lineHeight: 44 }}
                />
                <Text
                  className="text-muted ml-2"
                  style={{ fontFamily: "AlbertSans-Medium", fontSize: 14 }}
                >
                  RSD
                </Text>
              </View>
            </View>
          </MotiView>

          {/* Stat strip — count + average */}
          <MotiView
            from={{ opacity: 0, translateY: 8 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 350, delay: 140 }}
          >
            <StatStrip
              className=""
              items={[
                {
                  label: t("admin.manage.transactionCount"),
                  value: summaryStats.count,
                  testID: "naplata-transaction-count",
                },
                {
                  label: t("admin.manage.avgPerClient"),
                  value: summaryStats.avg
                    ? `${Math.round(summaryStats.avg).toLocaleString("sr-RS")}`
                    : undefined,
                  accent: true,
                },
              ]}
            />
            {filtersActive ? (
              <Text
                testID="naplata-filtered-subtitle"
                className="text-muted font-body-medium mt-2"
                style={{ fontSize: 13 }}
              >
                {t("admin.manage.filteredSubtitle", {
                  count: filteredCount,
                  amount: filteredAmount.toLocaleString("sr-RS"),
                })}
              </Text>
            ) : null}
          </MotiView>

          {/* Search input — pinned in the header (testID anchors the e2e
              sticky-header spec). The per-client filter dropdown was
              dropped — the search field already filters by client name /
              notes, so the dropdown was a redundant second affordance. */}
          <MotiView
            from={{ opacity: 0, translateY: -6 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 300, delay: 180 }}
          >
            <Input
              testID="naplata-search-input"
              placeholder={t("admin.manage.searchPlaceholder")}
              leftIcon="search"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </MotiView>
        </View>

        {/* ── List body ─────────────────────────────────────────────────────
            Search input narrows client-side over already-loaded pages
            (documented above). The wrapper owns loading / empty / error /
            fetch-next-page footer states.

            PR β row shape: hairline list rows (~56-64px tall) instead of
            GlassCard chrome — same pattern as Klijenti. Two-line layout:
            client name + amount on the top row, method · date + status
            badge underneath. ItemSeparator is a 1px hairline indented
            20px from the left edge for editorial feel. */}
        <PaginatedList<BillingRecord>
          query={billingQuery}
          data={filteredRecords}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <BillingRow
              item={item}
              t={t}
              dateLocale={dateLocale}
              methodLabelKeys={methodLabelKeys}
              onPressPending={(record) => {
                setConfirmMethod(record.method);
                setConfirmTarget(record);
              }}
            />
          )}
          ItemSeparatorComponent={BillingRowSeparator}
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingBottom: bottomPad,
          }}
          errorState={<ErrorState message={t("admin.manage.billingError")} />}
          emptyState={<EmptyState title={t("admin.manage.billingEmpty")} />}
        />
      </View>

      {/* Create payment sheet — preserved wholesale (now mounted as a sibling
          of the list, not inside the old ScrollView). */}
      {/* push: the client-picker sheet stacks OVER this one (gorhom's default
          `switch` would flicker this closed→open as the picker opens/closes). */}
      <AppSheet
        open={showCreate}
        onOpenChange={setShowCreate}
        stackBehavior="push"
      >
        <View className="flex-col gap-4">
          <Text
            className="text-foreground font-body-bold"
            style={{ fontSize: 20, letterSpacing: -0.3 }}
          >
            {t("admin.manage.sheetNewPayment")}
          </Text>
          <Pressable
            testID="billing-client-trigger"
            onPress={() => setShowClientPicker(true)}
            className="flex-row items-center justify-between rounded-2xl border border-glass-border bg-glass-surface px-4 py-3.5 active:opacity-70"
            accessibilityRole="button"
            accessibilityLabel={t("admin.manage.client")}
          >
            <Text
              className={
                form.clientName
                  ? "text-foreground font-body-medium"
                  : "text-muted font-body-medium"
              }
              style={{ fontSize: 15 }}
              numberOfLines={1}
            >
              {form.clientName || t("admin.manage.client")}
            </Text>
            <Icon name="chevron-right" size={18} color={tokens.muted} />
          </Pressable>
          <Input
            testID="billing-amount-input"
            placeholder={t("admin.manage.placeholderAmount")}
            keyboardType="numeric"
            value={form.amount}
            onChangeText={(v) => setForm((s) => ({ ...s, amount: v }))}
          />
          <Select
            testID="billing-method-select"
            optionTestIDPrefix="billing-method-option"
            placeholder={t("admin.manage.paymentMethod")}
            value={form.method}
            onChange={(v) => setForm((s) => ({ ...s, method: v }))}
            options={methods.map((m) => ({
              value: m,
              label: t(methodLabelKeys[m]),
            }))}
          />
          <Select
            testID="billing-package-select"
            optionTestIDPrefix="billing-package-option"
            placeholder={t("admin.manage.packageOptional")}
            value={form.packageTypeId}
            onChange={(v) => {
              const deselecting = form.packageTypeId === v;
              // Prefill the amount from the catalog price when picking a
              // package and the amount field is still empty. Never clobber
              // a typed amount.
              const picked = deselecting
                ? undefined
                : (packageTypesQuery.data?.packageTypes ?? []).find(
                    (pt) => pt.id === v,
                  );
              setForm((s) => ({
                ...s,
                packageTypeId: deselecting ? "" : v,
                amount:
                  !deselecting && picked?.price != null && s.amount === ""
                    ? String(picked.price)
                    : s.amount,
              }));
            }}
            emptyText={t("admin.manage.packagesEmpty")}
            options={(packageTypesQuery.data?.packageTypes ?? [])
              .filter((pt) => !pt.isBirthdayGift)
              .map((pt) => ({
                value: pt.id,
                label: pt.name,
                hint: t("admin.manage.sessionsDays", {
                  count: pt.sessionCount,
                  days: pt.validityDays,
                }),
              }))}
          />
          <Input
            placeholder={t("admin.manage.placeholderNotes")}
            value={form.notes}
            onChangeText={(v) => setForm((s) => ({ ...s, notes: v }))}
          />
          <Button
            testID="billing-create-submit"
            disabled={
              createMutation.isPending || !form.clientUserId || !form.amount
            }
            onPress={() =>
              createMutation.mutate(
                {
                  clientUserId: form.clientUserId,
                  amount: parseInt(form.amount, 10),
                  method: form.method,
                  status: "CONFIRMED",
                  notes: form.notes || undefined,
                  packageTypeId: form.packageTypeId || undefined,
                  activatePackageOnConfirm: !!form.packageTypeId,
                },
                {
                  onSuccess: () => {
                    setShowCreate(false);
                    setForm({
                      clientUserId: "",
                      clientName: "",
                      amount: "",
                      method: "CASH",
                      notes: "",
                      packageTypeId: "",
                    });
                  },
                },
              )
            }
          >
            {t("admin.manage.create")}
          </Button>
          {createMutation.isError ? (
            <ErrorState message={t("admin.manage.createPaymentError")} />
          ) : null}
        </View>
      </AppSheet>

      {/* Confirm-payment sheet — a PENDING (pay-later) row was tapped. */}
      <AppSheet
        open={!!confirmTarget}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null);
        }}
      >
        {confirmTarget ? (
          <View className="flex-col gap-4">
            <Text
              className="text-foreground font-body-bold"
              style={{ fontSize: 20, letterSpacing: -0.3 }}
            >
              {t("admin.manage.confirmPaymentTitle")}
            </Text>
            <Text className="text-muted" style={{ fontSize: 13 }}>
              {t("admin.manage.confirmPaymentMessage")}
            </Text>
            <View className="flex-row items-center justify-between">
              <Text
                className="text-foreground font-body-semibold"
                style={{ fontSize: 15 }}
                numberOfLines={1}
              >
                {confirmTarget.client?.fullName ?? "—"}
              </Text>
              <Text
                className="text-foreground font-body-bold"
                style={{ fontSize: 16 }}
              >
                {formatRsd(confirmTarget.amount)}
              </Text>
            </View>
            <Select
              testID="billing-confirm-method-select"
              optionTestIDPrefix="billing-confirm-method-option"
              placeholder={t("admin.manage.paymentMethod")}
              value={confirmMethod}
              onChange={(v) => setConfirmMethod(v)}
              options={methods.map((m) => ({
                value: m,
                label: t(methodLabelKeys[m]),
              }))}
            />
            <Button
              testID="billing-confirm-submit"
              disabled={confirmMutation.isPending}
              onPress={() =>
                confirmMutation.mutate(
                  { id: confirmTarget.id, method: confirmMethod },
                  { onSuccess: () => setConfirmTarget(null) },
                )
              }
            >
              {t("admin.manage.confirmPaymentSubmit")}
            </Button>
            {confirmMutation.isError ? (
              <ErrorState message={t("admin.manage.confirmPaymentError")} />
            ) : null}
          </View>
        ) : null}
      </AppSheet>

      {/* Stacked over the create sheet — searchable, paginated client picker. */}
      <AppSheet
        open={showClientPicker}
        onOpenChange={setShowClientPicker}
        stackBehavior="push"
        snapPoints={["80%"]}
        rawContent
      >
        <BillingClientPickerSheet
          selectedId={form.clientUserId}
          onPick={(c) => {
            setForm((s) => ({
              ...s,
              clientUserId: c.userId,
              clientName: c.fullName,
            }));
            setShowClientPicker(false);
          }}
        />
      </AppSheet>
    </ScreenContainerRaw>
  );
}

// ─── BillingClientPickerSheet ───────────────────────────────────────────────
// Searchable, server-paginated client picker shown stacked over the New
// payment sheet. Mirrors the reservation-mode picker: sticky search header
// over a BottomSheetFlatList that scrolls in the sheet's own gesture context
// (rawContent + fixed snapPoint). Selecting a row returns the client to the
// form and closes this sheet.
function BillingClientPickerSheet({
  selectedId,
  onPick,
}: {
  selectedId: string;
  onPick: (c: { userId: string; fullName: string }) => void;
}) {
  const { t } = useTranslation();
  const tokens = useThemeTokens();
  const [q, setQ] = useState("");
  const deferredQ = useDebouncedValue(q.trim());
  const clientsQ = useInfiniteQuery(
    clientsQueries.list({ q: deferredQ || undefined }),
  );
  const rows = useMemo(
    () => clientsQ.data?.pages.flatMap((p) => p.clients) ?? [],
    [clientsQ.data],
  );

  return (
    <BottomSheetFlatList
      testID="billing-client-picker"
      data={rows}
      keyExtractor={(c) => c.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        paddingHorizontal: 24,
        paddingTop: 8,
        paddingBottom: 40,
      }}
      ListHeaderComponent={
        <View className="pb-3 gap-3">
          <Text
            className="text-foreground font-body-bold"
            style={{ fontSize: 20, letterSpacing: -0.3 }}
          >
            {t("admin.manage.sheetNewPayment")}
          </Text>
          <Input
            testID="billing-client-picker-search"
            placeholder={t("admin.clients.searchPlaceholder")}
            leftIcon="search"
            value={q}
            onChangeText={setQ}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      }
      ListEmptyComponent={
        clientsQ.isLoading ? (
          <View style={{ paddingTop: 12 }}>
            <SkeletonList count={4} />
          </View>
        ) : (
          <View style={{ paddingTop: 12 }}>
            <EmptyState
              title={
                deferredQ.length > 0
                  ? t("admin.clients.filterEmpty")
                  : t("admin.manage.emptyClients")
              }
            />
          </View>
        )
      }
      ListFooterComponent={
        clientsQ.isFetchingNextPage ? (
          <ActivityIndicator style={{ padding: 16 }} />
        ) : null
      }
      onEndReachedThreshold={0.4}
      onEndReached={() => {
        if (clientsQ.hasNextPage && !clientsQ.isFetchingNextPage) {
          clientsQ.fetchNextPage();
        }
      }}
      renderItem={({ item: c }) => {
        const isSelected = c.user.id === selectedId;
        return (
          <Pressable
            testID={`billing-client-option-${c.user.id}`}
            onPress={() => onPick({ userId: c.user.id, fullName: c.user.fullName })}
            android_ripple={null}
            className="flex-row items-center gap-3 py-3 active:opacity-70"
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
          >
            <View className="flex-1 gap-0.5">
              <Text
                className="text-foreground font-body-semibold"
                style={{ fontSize: 15 }}
                numberOfLines={1}
              >
                {c.user.fullName}
              </Text>
              <Text className="text-muted" style={{ fontSize: 12 }} numberOfLines={1}>
                {c.user.email}
              </Text>
            </View>
            {isSelected ? (
              <Icon name="check" size={16} color={tokens.accent} />
            ) : null}
          </Pressable>
        );
      }}
    />
  );
}

// ─── Row components ─────────────────────────────────────────────────────────
// PR β: hairline list row matching Klijenti's pattern. Two text rows + a
// status badge — drop the surrounding GlassCard so per-row height shrinks
// from ~140px to ~56-64px and the list shows 3x as many records per
// viewport.

function BillingRow({
  item,
  t,
  dateLocale,
  methodLabelKeys,
  onPressPending,
}: {
  item: BillingRecord;
  t: (key: string, opts?: Record<string, unknown>) => string;
  dateLocale: ReturnType<typeof getDateLocale>;
  methodLabelKeys: Record<string, string>;
  onPressPending: (record: BillingRecord) => void;
}) {
  const methodLabel = methodLabelKeys[item.method]
    ? t(methodLabelKeys[item.method])
    : item.method;
  const dateLabel = new Date(item.createdAt).toLocaleDateString(dateLocale);
  const isVoided = item.status === "VOIDED";
  const isPending = item.status === "PENDING";
  const row = (
    <View
      testID={`billing-row-${item.id}`}
      className="flex-row items-center gap-3 py-3"
      style={isVoided ? { opacity: 0.55 } : undefined}
    >
      <View className="flex-1 gap-0.5">
        {item.client?.fullName ? (
          <Text
            testID={`billing-row-client-${item.id}`}
            className="text-foreground font-body-semibold"
            style={{ fontSize: 15 }}
            numberOfLines={1}
          >
            {item.client.fullName}
          </Text>
        ) : null}
        <Text
          className="text-muted"
          style={{ fontSize: 12 }}
          numberOfLines={1}
        >
          {methodLabel} · {dateLabel}
        </Text>
      </View>
      <View className="items-end gap-1">
        <Text
          className={
            isVoided ? "text-muted font-body-semibold" : "text-foreground font-body-semibold"
          }
          style={{
            fontSize: 15,
            ...(isVoided ? { textDecorationLine: "line-through" as const } : {}),
          }}
          numberOfLines={1}
        >
          {formatRsd(item.amount)}
        </Text>
        {isPending ? (
          <Badge status="warning">{t("admin.manage.statusPending")}</Badge>
        ) : isVoided ? (
          <Badge status="neutral">{t("admin.manage.statusVoided")}</Badge>
        ) : (
          <Badge status="success">{t("admin.manage.statusConfirmed")}</Badge>
        )}
      </View>
    </View>
  );
  // Only PENDING rows act as a button — they open the confirm-payment sheet.
  if (!isPending) return row;
  return (
    <Pressable
      testID={`billing-row-pending-${item.id}`}
      onPress={() => onPressPending(item)}
      android_ripple={null}
      className="active:opacity-70"
      accessibilityRole="button"
      accessibilityLabel={t("admin.manage.confirmPaymentTitle")}
    >
      {row}
    </Pressable>
  );
}

function BillingRowSeparator() {
  // Hairline divider flush with the row content. Klijenti uses a left
  // inset to clear the avatar; Naplata rows have no leading adornment, so
  // an indented hairline reads as a misalignment.
  return <View className="bg-glass-border" style={{ height: 1 }} />;
}
